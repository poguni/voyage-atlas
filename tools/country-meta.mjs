// 국가·지역 기준표: ISO 2자리 | 한국어 이름 | 대륙 | 지위 | 검색용 다른 이름(쉼표)
// 지위: U = UN 회원국(193), O = UN 옵서버(2), R = 지역(국가 수에 넣지 않음)
// 대륙: AS 아시아, EU 유럽, AF 아프리카, NA 북아메리카, SA 남아메리카, OC 오세아니아, AN 남극권
// 경계 국가: 러시아·키프로스는 유럽, 튀르키예·조지아·아르메니아·아제르바이잔·카자흐스탄은 아시아, 이집트는 아프리카
// ISO 코드가 없는 지형(코소보 등)은 x- 로 시작하는 ID를 쓰고, 지도 이름(map)으로 연결합니다.

export const META = `
AF|아프가니스탄|AS|U
AM|아르메니아|AS|U
AZ|아제르바이잔|AS|U
BH|바레인|AS|U
BD|방글라데시|AS|U
BT|부탄|AS|U
BN|브루나이|AS|U
KH|캄보디아|AS|U
CN|중국|AS|U
GE|조지아|AS|U|그루지야
IN|인도|AS|U
ID|인도네시아|AS|U
IR|이란|AS|U
IQ|이라크|AS|U
IL|이스라엘|AS|U
JP|일본|AS|U
JO|요르단|AS|U
KZ|카자흐스탄|AS|U
KW|쿠웨이트|AS|U
KG|키르기스스탄|AS|U
LA|라오스|AS|U
LB|레바논|AS|U
MY|말레이시아|AS|U
MV|몰디브|AS|U
MN|몽골|AS|U
MM|미얀마|AS|U|버마
NP|네팔|AS|U
KP|북한|AS|U|조선민주주의인민공화국
OM|오만|AS|U
PK|파키스탄|AS|U
PH|필리핀|AS|U
QA|카타르|AS|U
SA|사우디아라비아|AS|U|사우디
SG|싱가포르|AS|U
KR|대한민국|AS|U|한국,남한
LK|스리랑카|AS|U
SY|시리아|AS|U
TJ|타지키스탄|AS|U
TH|태국|AS|U|타이
TL|동티모르|AS|U|티모르레스테
TR|튀르키예|AS|U|터키
TM|투르크메니스탄|AS|U
AE|아랍에미리트|AS|U|UAE,두바이
UZ|우즈베키스탄|AS|U
VN|베트남|AS|U
YE|예멘|AS|U
PS|팔레스타인|AS|O
AL|알바니아|EU|U
AD|안도라|EU|U
AT|오스트리아|EU|U
BY|벨라루스|EU|U
BE|벨기에|EU|U
BA|보스니아 헤르체고비나|EU|U|보스니아
BG|불가리아|EU|U
HR|크로아티아|EU|U
CY|키프로스|EU|U|사이프러스
CZ|체코|EU|U|체코공화국
DK|덴마크|EU|U
EE|에스토니아|EU|U
FI|핀란드|EU|U
FR|프랑스|EU|U
DE|독일|EU|U
GR|그리스|EU|U
HU|헝가리|EU|U
IS|아이슬란드|EU|U
IE|아일랜드|EU|U
IT|이탈리아|EU|U
LV|라트비아|EU|U
LI|리히텐슈타인|EU|U
LT|리투아니아|EU|U
LU|룩셈부르크|EU|U
MT|몰타|EU|U
MD|몰도바|EU|U
MC|모나코|EU|U
ME|몬테네그로|EU|U
NL|네덜란드|EU|U|홀란드
MK|북마케도니아|EU|U|마케도니아
NO|노르웨이|EU|U
PL|폴란드|EU|U
PT|포르투갈|EU|U
RO|루마니아|EU|U
RU|러시아|EU|U
SM|산마리노|EU|U
RS|세르비아|EU|U
SK|슬로바키아|EU|U
SI|슬로베니아|EU|U
ES|스페인|EU|U
SE|스웨덴|EU|U
CH|스위스|EU|U
UA|우크라이나|EU|U
GB|영국|EU|U|UK,잉글랜드,스코틀랜드
VA|바티칸|EU|O|교황청
DZ|알제리|AF|U
AO|앙골라|AF|U
BJ|베냉|AF|U
BW|보츠와나|AF|U
BF|부르키나파소|AF|U
BI|부룬디|AF|U
CV|카보베르데|AF|U|케이프베르데
CM|카메룬|AF|U
CF|중앙아프리카공화국|AF|U
TD|차드|AF|U
KM|코모로|AF|U
CG|콩고|AF|U|콩고공화국
CD|콩고민주공화국|AF|U
CI|코트디부아르|AF|U|아이보리코스트
DJ|지부티|AF|U
EG|이집트|AF|U
GQ|적도기니|AF|U
ER|에리트레아|AF|U
SZ|에스와티니|AF|U|스와질란드
ET|에티오피아|AF|U
GA|가봉|AF|U
GM|감비아|AF|U
GH|가나|AF|U
GN|기니|AF|U
GW|기니비사우|AF|U
KE|케냐|AF|U
LS|레소토|AF|U
LR|라이베리아|AF|U
LY|리비아|AF|U
MG|마다가스카르|AF|U
MW|말라위|AF|U
ML|말리|AF|U
MR|모리타니|AF|U
MU|모리셔스|AF|U
MA|모로코|AF|U
MZ|모잠비크|AF|U
NA|나미비아|AF|U
NE|니제르|AF|U
NG|나이지리아|AF|U
RW|르완다|AF|U
ST|상투메 프린시페|AF|U
SN|세네갈|AF|U
SC|세이셸|AF|U
SL|시에라리온|AF|U
SO|소말리아|AF|U
ZA|남아프리카공화국|AF|U|남아공
SS|남수단|AF|U
SD|수단|AF|U
TZ|탄자니아|AF|U
TG|토고|AF|U
TN|튀니지|AF|U
UG|우간다|AF|U
ZM|잠비아|AF|U
ZW|짐바브웨|AF|U
AG|앤티가 바부다|NA|U
BS|바하마|NA|U
BB|바베이도스|NA|U
BZ|벨리즈|NA|U
CA|캐나다|NA|U
CR|코스타리카|NA|U
CU|쿠바|NA|U
DM|도미니카 연방|NA|U
DO|도미니카공화국|NA|U
SV|엘살바도르|NA|U
GD|그레나다|NA|U
GT|과테말라|NA|U
HT|아이티|NA|U
HN|온두라스|NA|U
JM|자메이카|NA|U
MX|멕시코|NA|U
NI|니카라과|NA|U
PA|파나마|NA|U
KN|세인트키츠 네비스|NA|U
LC|세인트루시아|NA|U
VC|세인트빈센트 그레나딘|NA|U
TT|트리니다드 토바고|NA|U
US|미국|NA|U|USA,하와이
AR|아르헨티나|SA|U
BO|볼리비아|SA|U
BR|브라질|SA|U
CL|칠레|SA|U
CO|콜롬비아|SA|U
EC|에콰도르|SA|U
GY|가이아나|SA|U
PY|파라과이|SA|U
PE|페루|SA|U
SR|수리남|SA|U
UY|우루과이|SA|U
VE|베네수엘라|SA|U
AU|호주|OC|U|오스트레일리아
FJ|피지|OC|U
KI|키리바시|OC|U
MH|마셜 제도|OC|U
FM|미크로네시아|OC|U
NR|나우루|OC|U
NZ|뉴질랜드|OC|U
PW|팔라우|OC|U
PG|파푸아뉴기니|OC|U
WS|사모아|OC|U
SB|솔로몬 제도|OC|U
TO|통가|OC|U
TV|투발루|OC|U
VU|바누아투|OC|U
TW|대만|AS|R|타이완
HK|홍콩|AS|R
MO|마카오|AS|R
IO|영국령 인도양 지역|AS|R
FO|페로 제도|EU|R
AX|올란드 제도|EU|R
GG|건지|EU|R
JE|저지|EU|R
IM|맨섬|EU|R
EH|서사하라|AF|R
SH|세인트헬레나|AF|R
GL|그린란드|NA|R
PR|푸에르토리코|NA|R
AI|앵귈라|NA|R
AW|아루바|NA|R
BM|버뮤다|NA|R
BL|생바르텔레미|NA|R
CW|퀴라소|NA|R
KY|케이맨 제도|NA|R
MF|생마르탱|NA|R
MS|몬트세랫|NA|R
PM|생피에르 미클롱|NA|R
SX|신트마르턴|NA|R
TC|터크스 케이커스 제도|NA|R
VG|영국령 버진아일랜드|NA|R
VI|미국령 버진아일랜드|NA|R
FK|포클랜드 제도|SA|R
AS|아메리칸사모아|OC|R
CK|쿡 제도|OC|R
GU|괌|OC|R
MP|북마리아나 제도|OC|R|사이판
NC|뉴칼레도니아|OC|R
NF|노퍽섬|OC|R
NU|니우에|OC|R
PF|프랑스령 폴리네시아|OC|R|타히티
PN|핏케언 제도|OC|R
WF|왈리스 푸투나|OC|R
TF|프랑스령 남방 지역|AN|R
HM|허드 맥도널드 제도|AN|R
GS|사우스조지아 사우스샌드위치 제도|AN|R
`;

// ISO 숫자 코드가 없는 지형: 지도 이름 → [앱 ID, ISO 2자리(국기용, 없으면 빈칸), 한국어, 대륙, 영어 이름]
export const NO_ID = {
  'Kosovo': ['x-kosovo', 'XK', '코소보', 'EU', 'Kosovo'],
  'N. Cyprus': ['x-ncyprus', '', '북키프로스', 'EU', 'Northern Cyprus'],
  'Somaliland': ['x-somaliland', '', '소말릴란드', 'AF', 'Somaliland'],
  'Indian Ocean Ter.': ['x-ioter', '', '오스트레일리아령 인도양 지역', 'AS', 'Australian Indian Ocean Territories'],
  'Siachen Glacier': ['x-siachen', '', '시아첸 빙하', 'AS', 'Siachen Glacier'],
};

// 50m 지도에 모양이 없는 UN 회원국: 마커로만 표시 [경도, 위도]
export const MARKER_ONLY = { TV: [179.2, -8.52] };
