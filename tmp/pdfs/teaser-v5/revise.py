from pathlib import Path
base=Path('output/pdf')
common='''
/* Hannes review: readable body type and a human story around the avatars. */
.opportunity-hero p,.barrier p,.team-intro,.person-card h3,.royalty p,.offering p,.stat p,.ask p,.fund h3,.fund p,.close-lead,.target p,.contact-name,.contact-role,.email{font-size:40px}
.market h2{font-size:36px}.market .year,.growth span,.royalty .eyebrow,.ask .eyebrow,.target-note{font-size:30px}
.team-intro{max-width:none;line-height:1.3}.team-grid{margin-top:27px}.portrait{height:295px}.person-card h3{min-height:108px}.team-promise{font-size:36px;margin-top:21px}
.royalty{padding-left:30px}.royalty .eyebrow{letter-spacing:0}.product-main{gap:45px}.product-main h1{font-size:66px}.product-main p{font-size:40px;margin-top:20px}.traction{padding-top:20px;margin-top:20px}.stat p{line-height:1.18}.offering{margin-top:28px}
.fund{grid-template-columns:126px 1fr;gap:16px;margin-top:20px;padding-bottom:18px}.fund p{line-height:1.2}.raise-content{gap:45px}.ask p{line-height:1.3}.contact{gap:28px}.email{font-size:38px;padding:24px 20px}.source{font-size:18px}
'''
mobile='''
/* Comfortable portrait reading: body text is 40 px on a 960 px page. */
.opportunity-hero{margin-top:39px}.opportunity-hero p{font-size:40px}.barriers{margin-top:28px}.barrier{padding:18px 0}.barrier p{font-size:40px}.market{margin-top:25px}.market .year,.growth span{font-size:30px}.market h2{font-size:36px}
.team-intro{font-size:40px;max-width:830px}.team-grid{margin-top:24px;row-gap:22px}.portrait{height:242px}.person-card h3{font-size:36px;min-height:94px}.team-promise{font-size:36px;margin-top:25px;text-align:center;max-width:820px}
.product-main{gap:23px;margin-top:36px}.product-main h1{font-size:64px}.product-main p{font-size:40px}.royalty{padding:21px 25px}.royalty .eyebrow{font-size:30px}.royalty p{font-size:40px}.offering p{font-size:40px}.offering{margin-top:22px}.stat p{font-size:38px}.stat{padding:16px 0}.traction{margin-top:21px;padding-top:0}
.raise-content{gap:24px;margin-top:32px}.ask p{font-size:40px}.ask .eyebrow{font-size:30px}.funds{padding-top:19px}.fund{grid-template-columns:140px 1fr;gap:24px;margin-top:19px;padding-bottom:18px}.fund h3,.fund p{font-size:38px}.fund p{line-height:1.25}.close-lead,.target p,.contact-role{font-size:40px}.target-note{font-size:30px}.email{font-size:40px}.section-label{font-size:18px}
'''
for suffix in ['', '-Mobile']:
 s=(base/f'Verkli-Tech-Week-Teaser-v4{suffix}.html').read_text()
 s=s.replace('<p class="team-intro">Human-centered guidance.<br> A familiar face for every step of publishing.</p>', '<p class="team-intro">A familiar face for every step of publishing.</p>')
 start=s.index('<section class="slide dark team">'); end=s.index('</section>',start)
 s=s[:end]+s[end:]
 pos=s.index('<footer>',start)
 s=s[:pos]+'<p class="team-promise">Powerful AI. Personal guidance. Always your story.</p>\n'+s[pos:]
 s=s.replace('Authors<br> on the waitlist','Waitlist<br> authors').replace('Languages represented<br> at beta','Languages<br> at beta')
 s=s.replace('</style>',common+(mobile if suffix else '.royalty .eyebrow{text-transform:none;font-size:30px}.barriers{margin-top:20px}')+'</style>')
 (base/f'Verkli-Tech-Week-Teaser-v5{suffix}.html').write_text(s)
