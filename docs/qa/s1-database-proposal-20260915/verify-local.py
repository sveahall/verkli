#!/usr/bin/env python3
"""Offline privilege regression, using a NEW Unix-socket-only PostgreSQL cluster.

No DATABASE_URL, Supabase key, network service or existing database is accepted.
--baseline intentionally fails the security assertions against the old grants.
--rollback checks that the reviewed recovery SQL restores that same baseline.
"""
import argparse
import json
from pathlib import Path
import subprocess
import tempfile

HERE = Path(__file__).resolve().parent
A = "00000000-0000-0000-0000-000000000001"
B = "00000000-0000-0000-0000-000000000002"
C = "00000000-0000-0000-0000-000000000003"
BOOK = "10000000-0000-0000-0000-000000000001"
args = argparse.ArgumentParser()
args.add_argument("--baseline", action="store_true")
args.add_argument("--rollback", action="store_true")
args.add_argument("--pg-bin", default="/usr/local/bin")
args.add_argument("--report", type=Path)
opts = args.parse_args()
if opts.baseline and opts.rollback:
    args.error("Choose either --baseline or --rollback")

# Discard inherited PG* variables and remote credentials. Use only our fresh socket.
env = {"PATH": "/usr/bin:/bin", "LC_ALL": "C"}
results = []
with tempfile.TemporaryDirectory(prefix="verkli-s1-", dir="/tmp") as directory:
    root = Path(directory)
    root.chmod(0o700)
    data = root / "data"
    def command(tool, *arguments, sql=None, check=True):
        return subprocess.run([str(Path(opts.pg_bin) / tool), *arguments],
                              input=sql, text=True, capture_output=True,
                              env=env, timeout=30, check=check)

    command("initdb", "-D", str(data), "-U", "postgres", "--auth-local=trust",
            "--auth-host=reject", "--no-locale", "--encoding=UTF8")
    command("pg_ctl", "-D", str(data), "-l", str(root / "postgres.log"),
            "-o", f"-k {root} -c listen_addresses='' -c unix_socket_permissions=0700", "-w", "start")
    try:
        def query(sql, check=True):
            return command("psql", "-X", "-qAt", "-h", str(root), "-U", "postgres",
                           "-d", "postgres", "-v", "ON_ERROR_STOP=1",
                           "-v", "VERBOSITY=verbose", sql=sql, check=check)

        version = query("SHOW server_version;").stdout.strip()
        query((HERE / "fixture.sql").read_text())
        if not opts.baseline:
            # The exact proposal body is wrapped in one explicit transaction.
            query("BEGIN;\n" + (HERE / "hardening.sql").read_text() + "\nCOMMIT;")
            # Parse the actual read-only verification query on the same fixture.
            json.loads(query((HERE / "postcheck.sql").read_text()).stdout)
        if opts.rollback:
            query("BEGIN;\n" + (HERE / "rollback.sql").read_text() + "\nCOMMIT;")

        def test(name, sql, expected="t", role="authenticated", uid=A, denied=False):
            identity = (f"SET LOCAL ROLE {role}; SET LOCAL request.jwt.claim.sub='{uid}'; "
                        f"SET LOCAL request.jwt.claim.role='{role}';") if role else ""
            result = query(f"BEGIN; {identity}\n{sql}\nROLLBACK;", check=False)
            passed = ((result.returncode != 0 and "42501" in result.stderr) if denied
                      else result.returncode == 0 and result.stdout.strip() == expected)
            item = {"name": name, "passed": passed, "exit": result.returncode}
            if not passed:
                item.update(stdout=result.stdout.strip(), stderr=result.stderr.strip())
            results.append(item)
            print(("PASS " if passed else "FAIL ") + name)

        for role in ["author", "writer", "admin", "reader"]:
            test("signup metadata cannot grant " + role,
                 f"INSERT INTO auth.users VALUES ('{C[:-1]}4','{{\"role\":\"{role}\",\"name\":\"Sample\"}}'); "
                 f"SELECT role='reader' AND display_name='Sample' FROM profiles WHERE user_id='{C[:-1]}4';",
                 role=None)
        protected = {"role": "'admin'", "demo_mode": "true", "is_protected": "true",
                     "created_at": "now()", "updated_at": "now()", "search_vector": "'unsafe'::tsvector"}
        for column, value in protected.items():
            test("profile UPDATE denied: " + column,
                 f"UPDATE profiles SET {column}={value} WHERE user_id='{A}';", denied=True)
            test("profile INSERT denied: " + column,
                 f"INSERT INTO profiles(user_id,{column}) VALUES ('{C}',{value});", uid=C, denied=True)
        test("profile DELETE denied", f"DELETE FROM profiles WHERE user_id='{A}';", denied=True)
        for table in ["profiles", "ai_jobs", "audiobook_assets", "chapter_audio_cache"]:
            test(table + " TRUNCATE denied", f"TRUNCATE {table};", denied=True)
            for role in ["anon", "authenticated"]:
                test(table + " has no dangerous table grants for " + role,
                     f"SELECT NOT (has_table_privilege('{role}','{table}','INSERT') OR "
                     f"has_table_privilege('{role}','{table}','UPDATE') OR "
                     f"has_table_privilege('{role}','{table}','TRIGGER') OR "
                     f"has_table_privilege('{role}','{table}','REFERENCES'));", role=None)
                if int(version.split('.')[0]) >= 17:
                    test(table + " MAINTAIN denied for " + role,
                         f"SELECT NOT has_table_privilege('{role}','{table}','MAINTAIN');", role=None)

        editable = {"user_id": f"'{A}'::uuid", "display_name": "'Saved name'", "avatar_url": "'avatar.png'",
                    "cover_image": "'cover.png'", "bio": "'My bio'", "is_public": "false",
                    "website_url": "'https://example.invalid'", "social_links": "'{}'::jsonb",
                    "preferences": "'{\"fontSize\":18}'::jsonb", "username": "'sample'",
                    "age_verified_at": "now()", "onboarding_completed_at": "now()",
                    "deletion_requested_at": "now()"}
        fields = ",".join(editable)
        assignments = ",".join(f"{field}=EXCLUDED.{field}" for field in editable)
        test("existing author: complete profile upsert preserves role",
             f"INSERT INTO profiles({fields}) VALUES ({','.join(editable.values())}) "
             f"ON CONFLICT(user_id) DO UPDATE SET {assignments}; "
             f"SELECT role='author' AND display_name='Saved name' AND preferences->>'fontSize'='18' "
             f"FROM profiles WHERE user_id='{A}';")
        test("missing profile: safe upsert creates reader",
             f"INSERT INTO profiles(user_id,preferences) VALUES ('{C}','{{\"fontSize\":18}}') "
             "ON CONFLICT(user_id) DO UPDATE SET user_id=EXCLUDED.user_id,preferences=EXCLUDED.preferences; "
             f"SELECT role='reader' AND demo_mode=false FROM profiles WHERE user_id='{C}';", uid=C)
        test("reader autosave preserves existing preference JSON",
             f"UPDATE profiles SET preferences='{{\"lineHeight\":1.8}}' WHERE user_id='{B}'; "
             f"SELECT preferences->>'lineHeight'='1.8' FROM profiles WHERE user_id='{B}';", uid=B)
        test("cannot move own profile to foreign user", f"UPDATE profiles SET user_id='{C}' WHERE user_id='{A}';", denied=True)
        test("cannot upsert foreign profile", f"INSERT INTO profiles(user_id,display_name) VALUES ('{B}','Bad') "
             "ON CONFLICT(user_id) DO UPDATE SET display_name=EXCLUDED.display_name;", denied=True)
        test("existing roles unchanged", f"SELECT role='author' FROM profiles WHERE user_id='{A}';")
        test("service can grant approved author and demo", f"UPDATE profiles SET role='author',demo_mode=true WHERE user_id='{B}'; "
             f"SELECT role='author' AND demo_mode FROM profiles WHERE user_id='{B}';", role="service_role")
        for table, column in [("ai_jobs", "output"), ("audiobook_assets", "audio_path"), ("chapter_audio_cache", "audio_path")]:
            value = "'{}'::jsonb" if column == "output" else "'foreign/private.mp3'"
            test(table + " client UPDATE denied", f"UPDATE {table} SET {column}={value};", denied=True)
            test(table + " service UPDATE permitted", f"WITH changed AS (UPDATE {table} SET {column}={value} RETURNING 1) "
                 "SELECT count(*)>0 FROM changed;", role="service_role")
        test("client asset INSERT denied", f"INSERT INTO audiobook_assets VALUES ('40000000-0000-0000-0000-000000000002','{BOOK}','foreign.mp3','sv');", denied=True)
        test("service asset upsert permitted", f"INSERT INTO audiobook_assets VALUES ('40000000-0000-0000-0000-000000000002','{BOOK}','new.mp3','en') "
             "ON CONFLICT(book_id,language) DO UPDATE SET audio_path=EXCLUDED.audio_path; "
             "SELECT audio_path='new.mp3' FROM audiobook_assets;", role="service_role")
        test("own job SELECT preserved", "SELECT count(*)=1 FROM ai_jobs;")
        test("own job cleanup DELETE preserved", "WITH removed AS (DELETE FROM ai_jobs RETURNING 1) SELECT count(*)=1 FROM removed;")
        test("own asset SELECT preserved", "SELECT count(*)=1 FROM audiobook_assets;")
        test("own cache SELECT preserved", "SELECT count(*)=1 FROM chapter_audio_cache;")
        for bucket in ["audiobooks", "tts-outputs", "content-assets"]:
            test(bucket + " foreign direct SELECT denied", f"SELECT count(*)=0 FROM storage.objects WHERE bucket_id='{bucket}';")
            test(bucket + " service access preserved", f"SELECT count(*)=1 FROM storage.objects WHERE bucket_id='{bucket}';", role="service_role")
        test("unrelated cover SELECT preserved", "SELECT count(*)=1 FROM storage.objects WHERE bucket_id='book_covers';")
        test("service bypass-RLS role unchanged", "SELECT rolbypassrls FROM pg_roles WHERE rolname='service_role';", role=None)
        failures = sum(not item["passed"] for item in results)
        report = {"mode": "baseline" if opts.baseline else "rollback" if opts.rollback else "candidate",
                  "postgres": version, "scope": "local synthetic SQL; no PostgREST, Storage HTTP, UI or production mutation",
                  "passed": len(results)-failures, "failed": failures, "results": results}
        if opts.report:
            opts.report.write_text(json.dumps(report, indent=2) + "\n")
        print(f"{len(results)-failures} passed, {failures} failed; PostgreSQL {version}")
    finally:
        command("pg_ctl", "-D", str(data), "-m", "fast", "-w", "stop")
raise SystemExit(1 if failures else 0)
