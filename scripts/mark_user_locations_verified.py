from pathlib import Path

p = Path(__file__).resolve().parents[1] / 'index.html'
s = p.read_text(encoding='utf-8')

if 'v4.9' in s and 'ユーザー確認住所' in s and '位置確認済' in s:
    print('v4.9 already patched')
    raise SystemExit(0)

if 'v4.8' not in s:
    raise SystemExit('Expected v4.8 index.html')

s = s.replace('v4.8', 'v4.9')
old = "function isGoogleVerified(p){return !!(p&&(p['座標ステータス']==='Google Places確認済'||p['座標ステータス']==='Google Places自動確認済'||p['座標ステータス']==='Google Maps座標確認済'||p['google_place_id']))}function updateGoogleProgress(){let el=$('googleVerifyProgress');if(!el)return;let done=P.filter(isGoogleVerified).length,total=P.length,left=total-done;el.textContent=`Google確認済 ${done} / ${total}件　・　未確認 ${left}件`}"
new = "function isGoogleVerified(p){let st=p?.['座標ステータス']||'';return !!(p&&(st==='Google Places確認済'||st==='Google Places自動確認済'||st==='Google Maps座標確認済'||st==='ユーザー確認座標'||st==='ユーザー確認住所'||p['確認ステータス']==='ユーザー利用確認済'||p['google_place_id']))}function updateGoogleProgress(){let el=$('googleVerifyProgress');if(!el)return;let done=P.filter(isGoogleVerified).length,total=P.length,left=total-done;el.textContent=`位置確認済 ${done} / ${total}件　・　未確認 ${left}件`}"
if old not in s:
    raise SystemExit('Verification function marker not found')
s = s.replace(old, new)

p.write_text(s, encoding='utf-8')
print('patched index.html to v4.9')
