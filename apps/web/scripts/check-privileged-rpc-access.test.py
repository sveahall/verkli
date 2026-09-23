# Standalone PostgreSQL regression: python3 apps/web/scripts/check-privileged-rpc-access.test.py
# Uses an isolated temporary cluster and synthetic schema; never connects to a configured DB.
# Set PG_BINDIR to the directory containing initdb, pg_ctl and psql (PostgreSQL 14+).
from pathlib import Path
import json, os, shutil, tempfile, subprocess
source=Path(__file__).with_name('check-privileged-rpc-access.sql')
assert source.is_file(), 'Read-only privileged-RPC release guard has not been implemented'
guard=source.read_text()
pg=Path(os.environ.get('PG_BINDIR') or Path(shutil.which('initdb') or '/missing/initdb').parent)
assert (pg/'initdb').is_file(), 'Set PG_BINDIR to your PostgreSQL binary directory'
signatures=['dm_consume_rate_limit(uuid,integer,integer)', 'finalize_credit_topup_checkout_session(text)', 'finalize_donation_checkout_session(text)', 'finalize_order_checkout_session(text)', 'grant_user_credits_once(uuid,integer,text,uuid)', 'refresh_book_audiobook_status(uuid)', 'revoke_order_for_refund(text,text)', 'update_author_subscription_status(text,text,timestamp with time zone,timestamp with time zone)', 'upsert_author_subscription(uuid,uuid,text,text,integer,text,text,timestamp with time zone,timestamp with time zone)']
checks=[];logs=[]
with tempfile.TemporaryDirectory(prefix='verkli-guard-',dir='/tmp') as tmp:
 root=Path(tmp); sock=root/'socket';sock.mkdir();data=root/'data';started=False
 def run(args):
  # Neither libpq connection defaults nor psql startup files may redirect the fixture.
  isolated_env={k:v for k,v in os.environ.items() if not k.startswith('PG') and k!='PSQLRC'}
  r=subprocess.run([str(pg/args[0]),*args[1:]],capture_output=True,text=True,timeout=30,env=isolated_env)
  logs.append(r.stdout+r.stderr)
  return r
 def sql(query):
  f=root/'query.sql';f.write_text(query)
  return run(['psql','-X','-h',str(sock),'-p','56439','-U','audit_owner','-d','postgres','-v','ON_ERROR_STOP=1','-Atq','-f',str(f)])
 def ok(query):
  r=sql(query);assert r.returncode==0,r.stderr;return r
 def check(label,expected_error=None):
  r=sql(guard)
  if expected_error:
   assert r.returncode!=0 and expected_error in r.stderr,(label,r.returncode,r.stdout,r.stderr)
  else:
   assert r.returncode==0 and 'privileged-rpc-access: PASS' in r.stdout,(label,r.stdout,r.stderr)
  checks.append(label)
 try:
  assert run(['initdb','-D',str(data),'-U','audit_owner','-A','trust']).returncode==0
  assert run(['pg_ctl','-D',str(data),'-l',str(root/'server.log'),'-o',f"-F -c listen_addresses='' -k {sock} -p 56439",'-w','start']).returncode==0;started=True
  ok("CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; CREATE TABLE public.author_subscriptions(id uuid,subscriber_user_id uuid); ALTER TABLE public.author_subscriptions ENABLE ROW LEVEL SECURITY; CREATE POLICY own_select ON public.author_subscriptions FOR SELECT TO authenticated USING (true);")
  for sig in signatures:
   ok("CREATE FUNCTION public."+sig+" RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN RAISE EXCEPTION 'MUTATING RPC MUST NEVER BE INVOKED BY CHECK'; END; $$; REVOKE ALL ON FUNCTION public."+sig+" FROM PUBLIC; GRANT EXECUTE ON FUNCTION public."+sig+" TO service_role;")
  check('safe permissions pass without invoking any business function')
  for role in ['anon','authenticated','service_role']:
   ok('ALTER ROLE '+role+' RENAME TO temporarily_missing_role')
   check('reject missing role '+role,'[security permissions] missing')
   ok('ALTER ROLE temporarily_missing_role RENAME TO '+role)
  sig='public.dm_consume_rate_limit(uuid,integer,integer)'
  for role in ['PUBLIC','anon','authenticated']:
   ok('GRANT EXECUTE ON FUNCTION '+sig+' TO '+role)
   check('reject execute granted to '+role,'client execution')
   ok('REVOKE EXECUTE ON FUNCTION '+sig+' FROM '+role)
  ok('CREATE ROLE inherited_rpc_access; GRANT inherited_rpc_access TO authenticated; GRANT EXECUTE ON FUNCTION '+sig+' TO inherited_rpc_access')
  check('reject inherited execution grant','client execution')
  ok('REVOKE EXECUTE ON FUNCTION '+sig+' FROM inherited_rpc_access')
  ok('REVOKE EXECUTE ON FUNCTION '+sig+' FROM service_role');check('reject missing server execution','service execution');ok('GRANT EXECUTE ON FUNCTION '+sig+' TO service_role')
  ok('ALTER TABLE public.author_subscriptions DISABLE ROW LEVEL SECURITY');check('reject disabled subscription RLS','row security');ok('ALTER TABLE public.author_subscriptions ENABLE ROW LEVEL SECURITY')
  for role in ['PUBLIC','authenticated','inherited_rpc_access']:
   ok('CREATE POLICY unsafe_write ON public.author_subscriptions FOR ALL TO '+role+' USING (true)')
   check('reject subscription write policy for '+role,'subscription write policy')
   ok('DROP POLICY unsafe_write ON public.author_subscriptions')
  ok('ALTER ROLE anon BYPASSRLS');check('reject client RLS bypass','client role bypass');ok('ALTER ROLE anon NOBYPASSRLS')
  ok('CREATE ROLE subscription_owner; ALTER TABLE public.author_subscriptions OWNER TO subscription_owner; GRANT subscription_owner TO authenticated')
  check('reject inherited table ownership bypass','client role bypass')
  ok('ALTER TABLE public.author_subscriptions FORCE ROW LEVEL SECURITY')
  check('forced RLS still applies to inherited table owner')
  ok('ALTER TABLE public.author_subscriptions NO FORCE ROW LEVEL SECURITY')
  ok('REVOKE subscription_owner FROM authenticated; ALTER TABLE public.author_subscriptions OWNER TO audit_owner')
  ok('DROP FUNCTION '+sig);check('reject missing expected function','missing function')
  result={'status':'passed','checks':checks,'liveWrites':False,'businessFunctionsCalled':False,'networkListener':False}
  print(json.dumps(result,indent=2))
 finally:
  if started:run(['pg_ctl','-D',str(data),'-m','fast','-w','stop'])
  if os.environ.get('RPC_GUARD_TEST_LOG'):
   Path(os.environ['RPC_GUARD_TEST_LOG']).write_text('\n'.join(logs))
