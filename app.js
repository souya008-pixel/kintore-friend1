'use strict';
/* 筋トレ計画 — 理想体型プランナー
   体組成を1週間ずつシミュレーションし、その週の期（減量・増量・維持）に合わせて
   自重／ダンベルのメニューと、日ごとの摂取カロリー・PFCを組み立てる。 */
(() => {
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const r1 = x => (Math.round(x * 10) / 10).toFixed(1);
const num = x => Math.round(x).toLocaleString('ja-JP');
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } }
};
const K_PROFILE = 'kintoreF1.profile', K_DONE = 'kintoreF1.done', K_WEIGHT = 'kintoreF1.weights', K_TIP = 'kintoreF1.iosTip';

/* ---------- dates (local time) ---------- */
const DOW = ['日', '月', '火', '水', '木', '金', '土'];
const ymd = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const parseYmd = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() + n); return x; };
const dayDiff = (a, b) => Math.round((parseYmd(ymd(b)) - parseYmd(ymd(a))) / 864e5);
const md = d => `${d.getMonth() + 1}/${d.getDate()}`;
const mdw = d => `${md(d)}（${DOW[d.getDay()]}）`;
const QS = new URLSearchParams(location.search);
const todayDate = () => QS.get('today') ? parseYmd(QS.get('today')) : parseYmd(ymd(new Date()));

/* ---------- constants ---------- */
const WPM = 4.345;            // weeks per month
const FAT_KCAL = 7200;        // 体脂肪1kg ≒ 7,200kcal
const LEAN_KCAL = 2500;       // 除脂肪組織1kgをつくるのに必要なエネルギー（合成コスト込みの概算）
const MAXW = 156;             // 最長3年まで計算
const KEEPW = 8;              // 達成後の維持期を何週見せるか
const PAL = { low: 1.4, mid: 1.6, high: 1.8 }; // 筋トレ以外の生活活動
const PAL_LABEL = { low: '少ない（デスクワーク中心）', mid: 'ふつう（よく歩く・立ち仕事）', high: '多い（肉体労働・1日中動く）' };
const EXP = {
  none: { label: 'ほぼ初めて', months: 0, lvl: 0, str: 1.0 },
  lt6: { label: '半年未満', months: 3, lvl: 0, str: 1.15 },
  '1y': { label: '1年くらい', months: 12, lvl: 1, str: 1.35 },
  '2y': { label: '2年以上', months: 30, lvl: 2, str: 1.6 }
};
const STY = {
  tone: { label: '引き締め重視：高めの回数・短めの休憩', main: [12, 15], bwMain: [12, 20], acc: [15, 20], sec: [30, 45], restMain: 60, restAcc: 45, setsMain: 3, setsAcc: 2, wf: 0.85 },
  hyper: { label: '筋肉をつけて引き締める：中くらいの回数', main: [8, 12], bwMain: [10, 15], acc: [12, 15], sec: [30, 60], restMain: 90, restAcc: 60, setsMain: 3, setsAcc: 3, wf: 1.0 },
  mass: { label: '筋肉を大きくする：やや重め・長めの休憩', main: [6, 10], bwMain: [8, 15], acc: [10, 15], sec: [40, 60], restMain: 120, restAcc: 60, setsMain: 4, setsAcc: 3, wf: 1.12 }
};
const PH = {
  cut: { name: '減量期', short: '減量', color: 'var(--ph-cut)', desc: '食事を少し減らして脂肪を落とす期間。筋トレは筋肉を守るために続けます。' },
  bulk: { name: '増量期', short: '増量', color: 'var(--ph-bulk)', desc: '少し多めに食べて筋肉を増やす期間。重さや回数を伸ばしていきます。' },
  keep: { name: '維持期', short: '維持', color: 'var(--ph-keep)', desc: '目標体型をキープする期間。食べる量は消費と同じくらいに。' }
};
const GOALS = {
  slim: { m: { name: 'スリム', ffmi: 18.5, bf: 13, desc: '余分な脂肪を落として、すっきり細身に' }, f: { name: 'スリム', ffmi: 14.5, bf: 23, desc: '全体をほっそり、すっきりしたラインに' } },
  hoso: { m: { name: '細マッチョ', ffmi: 20, gain: 2, bf: 12, desc: '腹筋がうっすら見える、引き締まった体' }, f: { name: '引き締めボディ', ffmi: 15.5, gain: 1, bf: 21, desc: 'お腹・お尻にメリハリのある体' } },
  macho: { m: { name: 'マッチョ', ffmi: 21.5, gain: 4, bf: 14, desc: '厚い胸板と広い肩。筋肉量を大きく増やす' }, f: { name: 'アスリート体型', ffmi: 16.5, gain: 2, bf: 20, desc: '筋肉のラインが見える力強い体' } },
  health: { m: { name: '健康的な標準', ffmi: 18.5, bf: 17, desc: '無理のない、健康的な体脂肪率に' }, f: { name: '健康的な標準', ffmi: 14.5, bf: 25, desc: '無理のない、健康的な体脂肪率に' } },
  custom: { m: { name: '目標体重を指定', desc: '自分で目標の体重（と体脂肪率）を決める' }, f: { name: '目標体重を指定', desc: '自分で目標の体重（と体脂肪率）を決める' } }
};

/* ---------- exercises ---------- */
// u: rep=回数 / sec=秒, side: 左右それぞれ, db: ダンベル重量の目安（体重比・男性初心者・片手）, single: ダンベル1個を両手で
const EX = {
  incline_pu: { n: 'インクライン腕立て伏せ', u: 'rep', t: '机やソファの縁に手をつき、頭からかかとまで一直線のまま胸を近づける。' },
  knee_pu: { n: '膝つき腕立て伏せ', u: 'rep', t: '膝から頭まで一直線。胸が床すれすれになるまで下ろし、押し返す。' },
  pushup: { n: '腕立て伏せ', u: 'rep', t: '手は肩幅より少し広く。お尻を落とさず、胸を床近くまで下ろす。' },
  decline_pu: { n: '足上げ腕立て伏せ', u: 'rep', t: '足を椅子やベッドに乗せて行う。胸の上部と肩の前に効く。' },
  archer_pu: { n: 'アーチャー腕立て伏せ', u: 'rep', side: true, t: '手を大きく広げ、片腕を伸ばしたまま反対側に体重を寄せて下ろす。' },
  db_press: { n: 'ダンベルプレス', u: 'rep', db: 0.14, t: 'ベンチか床に仰向け（床ならフロアプレス）。肩甲骨を寄せ、胸の横まで下ろして押し上げる。' },
  knee_pike: { n: '膝つきパイクプッシュアップ', u: 'rep', t: '四つんばいからお尻を高く上げ、頭を両手の間に下ろすように肘を曲げる。' },
  pike_pu: { n: 'パイクプッシュアップ', u: 'rep', t: '体を「へ」の字にして、頭のてっぺんを床に近づけて押し返す。肩に効く。' },
  elev_pike: { n: '足上げパイクプッシュアップ', u: 'rep', t: '足を椅子に乗せて逆V字に。より垂直に近い角度で肩を鍛える。' },
  wall_hspu: { n: '壁倒立プッシュアップ（浅め）', u: 'rep', t: '壁に足をつけて倒立し、頭を少し下ろして戻す。慣れるまでは浅く。' },
  db_spress: { n: 'ダンベルショルダープレス', u: 'rep', db: 0.10, t: '座って背すじを伸ばし、耳の横から頭上へ押し上げる。腰を反らさない。' },
  rev_angel: { n: 'リバーススノーエンジェル', u: 'rep', t: 'うつ伏せで胸を少し浮かせ、腕を体の横から頭上へ大きく回す。' },
  towel_row: { n: 'タオルロウ', u: 'rep', t: '開けたドアの両ノブにタオルを掛けて握り、体を後ろに倒して胸を引き寄せる。ドアが動かないよう注意。' },
  table_row_bent: { n: 'テーブルロウ（膝曲げ）', u: 'rep', t: '頑丈なテーブルの下に仰向けで入り、縁を握って胸を引き寄せる。' },
  table_row: { n: 'テーブルロウ（脚伸ばし）', u: 'rep', t: '脚を伸ばして体を一直線に。胸を縁まで引き、ゆっくり下ろす。' },
  superman: { n: 'スーパーマン', u: 'rep', t: 'うつ伏せで手足を同時に浮かせ、1秒止めて下ろす。背中の上の方を意識。' },
  prone_ytw: { n: 'Y・T・Wレイズ（うつ伏せ）', u: 'rep', t: 'うつ伏せで腕をY→T→Wの形に順に浮かせる。肩甲骨を寄せる意識で。' },
  back_ext: { n: 'バックエクステンション（3秒キープ）', u: 'rep', t: 'うつ伏せで上体をゆっくり起こし、3秒止める。反動を使わない。' },
  db_row1: { n: 'ワンハンドロウ', u: 'rep', side: true, db: 0.17, t: '片手と片膝を椅子につき、ダンベルを脇腹へ引き上げる。背中を丸めない。' },
  db_bor: { n: 'ダンベル・ベントオーバーロウ', u: 'rep', db: 0.13, t: '膝を軽く曲げて上体を45°前傾。両手のダンベルをおへそ方向へ引く。' },
  rear_raise: { n: 'リアレイズ', u: 'rep', db: 0.035, t: '前傾して腕を横へ開く。肩の後ろに効く。軽めで丁寧に。' },
  db_pullover: { n: 'ダンベルプルオーバー', u: 'rep', db: 0.12, single: true, t: '仰向けでダンベル1個を両手で持ち、頭の後ろへ弧を描いて下ろし、胸の上に戻す。' },
  chair_sq: { n: 'チェアスクワット', u: 'rep', t: '椅子に軽く座ってすぐ立つ。膝とつま先の向きをそろえる。' },
  air_sq: { n: 'スクワット', u: 'rep', t: '足は肩幅。お尻を後ろへ引き、太ももが床と平行になるまで下げる。' },
  split_sq: { n: 'スプリットスクワット', u: 'rep', side: true, t: '脚を前後に開いて真下に沈む。前脚のかかとで押し上げる。' },
  bulgarian: { n: 'ブルガリアンスクワット', u: 'rep', side: true, t: '後ろ足の甲を椅子に乗せ、前脚で深くしゃがむ。' },
  bulgarian_slow: { n: 'ブルガリアンスクワット（3秒で下ろす）', u: 'rep', side: true, t: '3秒かけてゆっくり沈み、1秒で立つ。自重でも強い負荷になる。' },
  goblet_sq: { n: 'ゴブレットスクワット', u: 'rep', db: 0.20, single: true, t: 'ダンベル1個を胸の前で縦に持ち、背すじを伸ばしたまま深くしゃがむ。' },
  db_bulgarian: { n: 'ダンベル・ブルガリアンスクワット', u: 'rep', side: true, db: 0.08, t: '両手にダンベル。後ろ足を椅子に乗せ、前脚で深くしゃがむ。' },
  hip_bridge: { n: 'ヒップリフト', u: 'rep', t: '仰向けで膝を立て、お尻を締めて持ち上げ、1秒止める。' },
  sl_bridge: { n: '片足ヒップリフト', u: 'rep', side: true, t: '片脚を浮かせたままお尻を持ち上げる。腰を反らさない。' },
  sl_rdl: { n: '片足デッドリフト（自重）', u: 'rep', side: true, t: '片脚立ちで上体を前に倒し、もも裏が伸びたら戻る。壁に手を添えてもOK。' },
  sl_thrust: { n: '片足ヒップスラスト', u: 'rep', side: true, t: '肩甲骨をソファの縁に乗せ、片脚でお尻を高く突き上げる。' },
  db_rdl: { n: 'ダンベル・ルーマニアンデッドリフト', u: 'rep', db: 0.16, t: '膝を軽く曲げ、お尻を後ろに引いてダンベルをすねまで下ろす。背中は真っすぐ。' },
  rev_lunge: { n: 'リバースランジ', u: 'rep', side: true, t: '片脚を後ろへ引いて沈み、前脚で押し戻る。上体はまっすぐ。' },
  fwd_lunge: { n: 'フォワードランジ', u: 'rep', side: true, t: '前へ大きく踏み出して沈み、前脚で蹴って戻る。' },
  walk_lunge: { n: 'ウォーキングランジ', u: 'rep', side: true, t: '左右交互に前へ進みながらランジ。狭ければその場で交互に。' },
  deficit_lunge: { n: '段差リバースランジ', u: 'rep', side: true, t: '階段の1段目などに立ち、後ろへ深く脚を引いて沈む。可動域が広がる。' },
  db_lunge: { n: 'ダンベルランジ', u: 'rep', side: true, db: 0.10, t: '両手にダンベルを下げて、リバースランジを行う。' },
  calf: { n: 'カーフレイズ', u: 'rep', t: '段差につま先を乗せ、かかとを大きく上下させる。' },
  sl_calf: { n: '片足カーフレイズ', u: 'rep', side: true, t: '壁に手を添え、片脚でかかとを高く上げる。' },
  db_calf: { n: 'ダンベル・カーフレイズ', u: 'rep', db: 0.15, t: 'ダンベルを持って段差の上でかかとを上下させる。' },
  knee_plank: { n: '膝つきプランク', u: 'sec', t: '肘と膝で体を支え、頭からお尻まで一直線に保つ。' },
  plank: { n: 'プランク', u: 'sec', t: '肘とつま先で支え、お腹に力を入れて体を一直線に保つ。' },
  plank_reach: { n: 'プランク・アームリーチ', u: 'sec', t: 'プランクのまま左右交互に片腕を前へ伸ばす。体がねじれないように。' },
  dead_bug: { n: 'デッドバグ', u: 'rep', side: true, t: '仰向けで手足を上げ、対角の手足をゆっくり伸ばす。腰は床に押しつけたまま。' },
  leg_raise: { n: 'レッグレイズ', u: 'rep', t: '仰向けで脚をそろえて上げ下げ。腰が浮くなら膝を曲げて。' },
  v_hold: { n: 'Vシット・ホールド', u: 'sec', t: 'お尻だけで座り、脚と上体を浮かせてV字をキープ。' },
  side_plank_knee: { n: '膝つきサイドプランク', u: 'sec', side: true, t: '横向きで肘と膝で支え、腰を持ち上げてキープ。' },
  side_plank: { n: 'サイドプランク', u: 'sec', side: true, t: '横向きで肘と足で支え、体を一直線にキープ。' },
  side_plank_dip: { n: 'サイドプランク・ヒップディップ', u: 'rep', side: true, t: 'サイドプランクの姿勢で腰をゆっくり下げて戻す。' },
  towel_curl: { n: 'タオルカール', u: 'rep', side: true, t: 'タオルの両端を持ち、片足で踏んで抵抗をかけながら肘を曲げる。' },
  db_curl: { n: 'ダンベルカール', u: 'rep', db: 0.08, t: '肘を体の横に固定し、手のひらを上に向けて巻き上げる。' },
  hammer_curl: { n: 'ハンマーカール', u: 'rep', db: 0.09, t: '親指を上にしたまま巻き上げる。前腕にも効く。' },
  bench_dip_bent: { n: 'ベンチディップス（膝曲げ）', u: 'rep', t: '椅子の縁に手をつき、肘を後ろへ曲げて体を沈める。' },
  bench_dip: { n: 'ベンチディップス（脚伸ばし）', u: 'rep', t: '脚を伸ばして負荷アップ。肩がすくまないように。' },
  diamond_pu: { n: 'ダイヤモンド腕立て伏せ', u: 'rep', t: '両手の親指と人差し指でひし形を作り、二の腕を意識して腕立て。' },
  db_french: { n: 'ダンベル・フレンチプレス', u: 'rep', db: 0.10, single: true, t: 'ダンベル1個を両手で頭上に持ち、肘を固定して頭の後ろへ下ろす。' },
  side_raise: { n: 'サイドレイズ', u: 'rep', db: 0.04, t: '腕を真横に肩の高さまで上げる。軽い重さで、反動を使わない。' },
  shoulder_tap: { n: 'ショルダータップ', u: 'rep', side: true, t: '腕立ての姿勢で、左右交互に反対の肩をタッチ。腰を揺らさない。' }
};
// 動きのパターン。bw=自重の難易度順、base=初心者の開始レベル（男/女）、db=ダンベル種目
const PAT = {
  hpush: { bw: ['incline_pu', 'knee_pu', 'pushup', 'decline_pu', 'archer_pu'], base: { m: 2, f: 1 }, db: 'db_press' },
  pushbw: { bw: ['incline_pu', 'knee_pu', 'pushup', 'decline_pu', 'archer_pu'], base: { m: 2, f: 1 } },
  vpush: { bw: ['knee_pike', 'pike_pu', 'elev_pike', 'wall_hspu'], base: { m: 1, f: 0 }, db: 'db_spress' },
  hpull: { bw: ['rev_angel', 'towel_row', 'table_row_bent', 'table_row'], base: { m: 1, f: 1 }, db: 'db_row1' },
  pull2: { bw: ['superman', 'prone_ytw', 'back_ext'], base: { m: 0, f: 0 }, db: 'db_bor' },
  rear: { bw: ['rev_angel', 'prone_ytw'], base: { m: 0, f: 0 }, db: 'rear_raise' },
  pullover: { bw: ['prone_ytw', 'back_ext'], base: { m: 0, f: 0 }, db: 'db_pullover' },
  squat: { bw: ['chair_sq', 'air_sq', 'split_sq', 'bulgarian', 'bulgarian_slow'], base: { m: 1, f: 1 }, db: 'goblet_sq' },
  squat2: { bw: ['split_sq', 'bulgarian', 'bulgarian_slow'], base: { m: 0, f: 0 }, db: 'db_bulgarian' },
  hinge: { bw: ['hip_bridge', 'sl_bridge', 'sl_rdl', 'sl_thrust'], base: { m: 0, f: 0 }, db: 'db_rdl' },
  lunge: { bw: ['rev_lunge', 'fwd_lunge', 'walk_lunge', 'deficit_lunge'], base: { m: 0, f: 0 }, db: 'db_lunge' },
  calf: { bw: ['calf', 'sl_calf'], base: { m: 0, f: 0 }, db: 'db_calf' },
  core1: { bw: ['knee_plank', 'plank', 'plank_reach'], base: { m: 1, f: 0 } },
  core2: { bw: ['dead_bug', 'leg_raise', 'v_hold'], base: { m: 0, f: 0 } },
  core3: { bw: ['side_plank_knee', 'side_plank', 'side_plank_dip'], base: { m: 1, f: 0 } },
  biceps: { bw: ['towel_curl'], base: { m: 0, f: 0 }, db: 'db_curl' },
  biceps2: { bw: ['towel_curl'], base: { m: 0, f: 0 }, db: 'hammer_curl' },
  triceps: { bw: ['bench_dip_bent', 'bench_dip', 'diamond_pu'], base: { m: 1, f: 0 }, db: 'db_french' },
  lateral: { bw: ['shoulder_tap'], base: { m: 0, f: 0 }, db: 'side_raise' }
};
const TPL = {
  FA: { name: '全身A', focus: '脚・胸・背中', slots: [['squat', 'main'], ['hpush', 'main'], ['hpull', 'main'], ['hinge', 'acc'], ['core1', 'core']] },
  FB: { name: '全身B', focus: 'お尻・肩・背中', slots: [['hinge', 'main'], ['vpush', 'main'], ['pull2', 'main'], ['lunge', 'acc'], ['core2', 'core']] },
  FC: { name: '全身C', focus: '脚・胸・腕', slots: [['lunge', 'main'], ['hpush', 'main'], ['hpull', 'main'], ['triceps', 'acc'], ['biceps', 'acc'], ['core3', 'core']] },
  UA: { name: '上半身A', focus: '胸・背中・肩', slots: [['hpush', 'main'], ['hpull', 'main'], ['vpush', 'main'], ['pull2', 'acc'], ['triceps', 'acc'], ['biceps', 'acc']] },
  LA: { name: '下半身A', focus: '太もも・お尻', slots: [['squat', 'main'], ['hinge', 'main'], ['lunge', 'acc'], ['calf', 'acc'], ['core1', 'core']] },
  UB: { name: '上半身B', focus: '肩・背中・胸', slots: [['vpush', 'main'], ['pull2', 'main'], ['pushbw', 'acc'], ['lateral', 'acc'], ['rear', 'acc'], ['core2', 'core']] },
  LB: { name: '下半身B', focus: 'お尻・もも裏・体幹', slots: [['hinge', 'main'], ['squat2', 'main'], ['calf', 'acc'], ['core3', 'core'], ['core2', 'core']] },
  PU: { name: 'プッシュの日', focus: '胸・肩・二の腕', slots: [['hpush', 'main'], ['vpush', 'main'], ['pushbw', 'acc'], ['lateral', 'acc'], ['triceps', 'acc'], ['core1', 'core']] },
  PL: { name: 'プルの日', focus: '背中・肩の後ろ・力こぶ', slots: [['hpull', 'main'], ['pull2', 'main'], ['pullover', 'acc'], ['rear', 'acc'], ['biceps2', 'acc'], ['core2', 'core']] },
  LG: { name: '脚の日', focus: '脚・お尻・体幹', slots: [['squat', 'main'], ['hinge', 'main'], ['lunge', 'acc'], ['calf', 'acc'], ['core3', 'core']] }
};
const SPLITS = { 2: ['FA', 'FB'], 3: ['FA', 'FB', 'FC'], 4: ['UA', 'LA', 'UB', 'LB'], 5: ['PU', 'PL', 'LG', 'UA', 'LB'], 6: ['PU', 'PL', 'LG', 'PU', 'PL', 'LG'] };
const SPLIT_LABEL = { 1: '全身（A・Bを週ごとに交互）', 2: '全身A・全身B', 3: '全身A・B・C', 4: '上半身／下半身を2回ずつ', 5: 'プッシュ・プル・脚＋上半身・下半身', 6: 'プッシュ・プル・脚を2回ずつ' };
const FIN = ['その場もも上げ と スクワット', 'ジャンピングジャック と マウンテンクライマー', 'バーピー と マウンテンクライマー'];
const ROLE = { main: 'メイン', acc: '補助', core: '体幹' };

/* ---------- body math ---------- */
const h2of = p => (p.height / 100) ** 2;
// 基礎代謝：国立健康・栄養研究所の式（日本人向け）
const bmrOf = (p, w) => (0.1238 + 0.0481 * w + 0.0234 * p.height - 0.0138 * p.age - 0.5473 * (p.sex === 'm' ? 1 : 2)) * 1000 / 4.186;
// 体脂肪率の推定（Deurenbergの式, BMI・年齢・性別から）
const estBF = p => clamp(1.2 * (p.weight / h2of(p)) + 0.23 * p.age - 10.8 * (p.sex === 'm' ? 1 : 0) - 5.4, p.sex === 'm' ? 6 : 12, 55);
const bf0Of = p => (p.bodyFat > 0 ? p.bodyFat : estBF(p));
function styleOf(p) {
  if (p.goal === 'custom') { const d = p.customWeight - p.weight; return d < -1 ? 'tone' : d > 3 ? 'mass' : 'hyper'; }
  return { slim: 'tone', health: 'tone', hoso: 'hyper', macho: 'mass' }[p.goal];
}
function targetOf(p) {
  const h2 = h2of(p), bf0 = bf0Of(p), L0 = p.weight * (1 - bf0 / 100), minBF = p.sex === 'm' ? 10 : 18, notes = [];
  let Lt, bft, mode = 'comp', tw = null;
  if (p.goal === 'custom') {
    tw = p.customWeight;
    if (p.customBF > 0) {
      // 体重と体脂肪率の両方を指定 → 体組成で判定
      bft = p.customBF; Lt = tw * (1 - bft / 100);
      if (bft < minBF) bft = minBF;
      const reach = Math.max(L0, Lt) / (1 - bft / 100);
      if (reach > tw + 0.5) notes.push(`筋肉を落とさない前提で計算しているため、目標の体脂肪率 ${r1(bft)}% に届く体重は約 ${r1(reach)}kg です（${r1(tw)}kgより少し重めになります）。`);
    } else {
      // 体重だけ指定 → 体重で判定
      mode = 'weight';
      Lt = tw <= p.weight ? L0 : L0 + 0.6 * (tw - p.weight);
      bft = (1 - Lt / tw) * 100;
      if (bft < minBF) notes.push(`筋肉を落とさずに ${r1(tw)}kg まで落とすと体脂肪率が約${r1(Math.max(0, bft))}%になり、低すぎます。体脂肪率 ${minBF}% に届いた時点を目標達成としています。`);
    }
  } else {
    const g = GOALS[p.goal][p.sex], base = g.ffmi * h2;
    // 筋肉系の目標は、すでに基準を満たしていても最低限の筋肉の上積みを目指す（基準+1までが上限）
    Lt = Math.max(L0, base, Math.min(L0 + (g.gain || 0), (g.ffmi + 1) * h2));
    bft = g.bf;
  }
  bft = Math.max(minBF, bft);
  return { bf0, L0, Lt, bft, mode, tw, style: styleOf(p), notes, minBF, estimated: !(p.bodyFat > 0) };
}
// 1か月に増やせる除脂肪量の目安（kg）
function gainPerMonth(p, tAge) {
  let r = tAge < 12 ? 0.75 : tAge < 24 ? 0.4 : 0.2;
  if (p.sex === 'f') r *= 0.5;
  r *= p.age < 35 ? 1 : p.age < 45 ? 0.85 : p.age < 55 ? 0.7 : 0.55;
  if (!p.dumbbell) r *= 0.85;
  return r;
}
function dbKg(p, ex, block, style) {
  const refW = Math.min(p.weight, 25 * h2of(p));
  let kg = ex.db * refW * (p.sex === 'm' ? 1 : 0.55) * EXP[p.exp].str * STY[style].wf * Math.min(1.8, 1 + 0.06 * block);
  kg = kg < 4 ? Math.max(1, Math.round(kg * 2) / 2) : Math.round(kg);
  let maxed = false;
  if (p.dbMax > 0 && kg > p.dbMax) { kg = p.dbMax; maxed = true; }
  return { kg, maxed };
}

/* ---------- weekly plan ---------- */
function session(p, T, st, tpl, c) {
  const S = STY[T.style], items = [], used = new Set();
  let workSec = 0;
  for (const [pid, role] of tpl.slots) {
    const pat = PAT[pid];
    let id = null, useDb = false;
    if (p.dumbbell && pat.db && !used.has(pat.db)) { id = pat.db; useDb = true; }
    else {
      const L = pat.bw.length;
      const heavy = p.weight / h2of(p) >= 30 ? 1 : 0; // BMI30以上は1段階やさしく始める
      const start = Math.max(0, Math.min(pat.base[p.sex] + EXP[p.exp].lvl - heavy, Math.max(0, L - 2)));
      const lv = clamp(start + Math.floor((c.wk - 1) / 8), 0, L - 1);
      for (const o of [0, -1, 1, -2, 2, -3, 3]) { const j = lv + o; if (j >= 0 && j < L && !used.has(pat.bw[j])) { id = pat.bw[j]; break; } }
    }
    if (!id) continue;
    used.add(id);
    const ex = EX[id];
    let sets = role === 'main' ? S.setsMain : S.setsAcc;
    if (c.wb === 2 && role === 'main') sets = Math.min(5, sets + 1);
    if (c.deload) sets = Math.max(1, sets - 1);
    else if (c.wk <= 2 && p.exp === 'none') sets = Math.max(2, sets - 1);
    const range = ex.u === 'sec' ? S.sec : role === 'main' ? (useDb ? S.main : S.bwMain) : S.acc;
    let tgt = (c.deload || c.wb === 0) ? range[0] : c.wb === 1 ? (range[0] + range[1]) / 2 : range[1];
    tgt = ex.u === 'sec' ? Math.round(tgt / 5) * 5 : Math.round(tgt);
    const rest = role === 'core' ? 30 : role === 'main' ? S.restMain : S.restAcc;
    let kg = null, maxed = false;
    if (useDb) ({ kg, maxed } = dbKg(p, ex, c.block, T.style));
    const per = (ex.u === 'sec' ? tgt : tgt * 3) * (ex.side ? 2 : 1);
    workSec += sets * per + (sets - 1) * rest + 60;
    items.push({ id, n: ex.n, u: ex.u, side: !!ex.side, single: !!ex.single, sets, tgt, kg, maxed, rest, tip: ex.t, role, db: useDb });
  }
  let fin = null;
  if (st.phase === 'cut' && !c.deload) {
    const bmi = p.weight / h2of(p);
    let lv = (p.exp === 'none' || bmi >= 27) ? 0 : p.exp === '2y' ? 2 : 1;
    if (c.wk > 8) lv++;
    lv = Math.min(lv, bmi >= 27 ? 1 : 2);
    fin = { n: 'フィニッシャー（脂肪燃焼）', desc: `${FIN[lv]}を交互に、20秒動いて10秒休む × 8回（約4分）` };
  }
  const W = st.W, trainMin = workSec / 60;
  const kcal = 3.5 * W * (trainMin / 60) * 1.05 + 1.5 * W * (8 / 60) * 1.05 + (fin ? 7 * W * (4 / 60) * 1.05 : 0);
  return { type: 'train', name: tpl.name, focus: tpl.focus, items, fin, min: Math.max(15, Math.round((trainMin + 8 + (fin ? 5 : 0)) / 5) * 5), exKcal: Math.round(kcal) };
}
function restDay(p, st) {
  const W = st.W;
  if (st.phase === 'cut') {
    const min = st.i <= 4 ? 30 : 40;
    return { type: 'rest', name: '休養日', act: `ウォーキング（早歩き）${min}分`, actNote: '脂肪燃焼の後押しに。1日8,000歩が目安です。', exKcal: Math.round(3 * W * min / 60 * 1.05) };
  }
  if (st.phase === 'keep') return { type: 'rest', name: '休養日', act: 'ウォーキング20分＋ストレッチ', actNote: '軽く体を動かして疲れを抜きましょう。', exKcal: Math.round(2.5 * W * 20 / 60 * 1.05) };
  return { type: 'rest', name: '休養日', act: 'しっかり休む（ストレッチ10分）', actNote: '筋肉は休んでいる間に育ちます。睡眠は7時間以上を。', exKcal: 0 };
}
function orderedDays(p) {
  const s = parseYmd(p.start).getDay();
  return [...p.days].sort((a, b) => ((a - s + 7) % 7) - ((b - s + 7) % 7)).slice(0, 6);
}
function buildDays(p, T, st) {
  const wk = st.i, wb = (wk - 1) % 4, c = { wk, wb, deload: wb === 3, block: Math.floor((wk - 1) / 4) };
  const tdays = orderedDays(p), n = tdays.length;
  const tpls = n === 1 ? [wk % 2 ? 'FA' : 'FB'] : SPLITS[n] || [];
  const out = [];
  for (let k = 0; k < 7; k++) {
    const date = addDays(st.start, k), dow = date.getDay(), ti = tdays.indexOf(dow);
    const d = { date: ymd(date), dow, k };
    Object.assign(d, ti >= 0 && tpls[ti] ? session(p, T, st, TPL[tpls[ti]], c) : restDay(p, st));
    out.push(d);
  }
  return { days: out, deload: c.deload, wb, block: c.block };
}
function energy(p, T, st, days) {
  const b = bmrOf(p, st.W), base = b * PAL[p.activity], floor = Math.max(b, p.sex === 'm' ? 1500 : 1200);
  const g = gainPerMonth(p, st.tAge) / WPM;
  let dL = 0, want = 0;
  if (st.phase === 'cut') {
    const far = T.mode === 'weight' ? st.W - T.tw > 3 : st.bf - T.bft > 4;
    const r = (far ? 0.0075 : 0.005) * (p.age < 18 ? 0.7 : 1); // 週あたり体重の0.5〜0.75%
    dL = st.tAge < 12 ? g * 0.4 : 0; // 初心者は減量中も少し筋肉が増える
    const dW = -r * st.W;
    want = (dL * LEAN_KCAL + (dW - dL) * FAT_KCAL) / 7;
  } else if (st.phase === 'bulk') {
    dL = g;
    const lf = st.tAge < 12 ? 0.6 : st.tAge < 24 ? 0.5 : 0.4; // 増えた体重のうち筋肉の割合
    want = Math.max(150, (dL * LEAN_KCAL + dL * (1 - lf) / lf * FAT_KCAL) / 7);
  }
  const refW = Math.min(st.W, 25 * h2of(p));
  const pk = st.phase === 'cut' ? (p.sex === 'm' ? 2.0 : 1.8) : (p.sex === 'm' ? 1.8 : 1.6);
  let bal = 0;
  for (const d of days) {
    const tdee = base + d.exKcal;
    let k = tdee + want;
    if (st.phase === 'cut') k = Math.max(k, floor, tdee * 0.75);
    k = Math.round(k / 10) * 10;
    const P = Math.round(refW * pk), F = Math.round(k * 0.25 / 9), C = Math.max(0, Math.round((k - P * 4 - F * 9) / 4));
    Object.assign(d, { tdee: Math.round(tdee), kcal: k, P, F, C, bal: Math.round(k - tdee) });
    bal += k - tdee;
  }
  bal /= 7;
  const dF = st.phase === 'keep' ? 0 : (bal * 7 - dL * LEAN_KCAL) / FAT_KCAL;
  if (st.phase === 'keep') dL = 0;
  return { dL, dF, avgKcal: Math.round(days.reduce((s, d) => s + d.kcal, 0) / 7), bmr: Math.round(b), base: Math.round(base), floor: Math.round(floor), balDay: Math.round(bal) };
}
function simulate(p) {
  const T = targetOf(p), start = parseYmd(p.start), weeks = [];
  let L = T.L0, F = p.weight - T.L0, tAge = EXP[p.exp].months;
  const bfNow = () => F / (L + F) * 100;
  let phase = T.mode === 'weight'
    ? (p.weight > T.tw + 0.3 && bfNow() > T.minBF ? 'cut' : p.weight < T.tw - 0.3 ? 'bulk' : 'keep')
    : bfNow() > T.bft + 0.5 ? 'cut' : (L < T.Lt - 0.3 ? 'bulk' : 'keep');
  let goalWeek = phase === 'keep' ? 0 : null;
  for (let i = 1; i <= MAXW; i++) {
    if (goalWeek !== null && i > goalWeek + KEEPW) break;
    const st = { i, W: L + F, L, F, bf: bfNow(), phase, tAge, start: addDays(start, 7 * (i - 1)) };
    const plan = buildDays(p, T, st);
    Object.assign(st, plan, energy(p, T, st, plan.days));
    weeks.push(st);
    L += st.dL; F += st.dF; tAge += 1 / WPM;
    const bf = bfNow();
    if (T.mode === 'weight') {
      if (phase === 'cut' && (L + F <= T.tw || bf <= T.minBF)) phase = 'keep';
      else if (phase === 'bulk' && L + F >= T.tw) phase = 'keep';
    }
    else if (phase === 'cut') { if (bf <= T.bft + 0.25) phase = L < T.Lt - 0.3 ? 'bulk' : 'keep'; }
    else if (phase === 'bulk') { if (L >= T.Lt - 0.3) phase = bf > T.bft + 0.5 ? 'cut' : 'keep'; else if (bf >= T.bft + 3) phase = 'cut'; }
    if (phase === 'keep' && goalWeek === null) goalWeek = i;
  }
  const end = { W: L + F, L, F, bf: bfNow() };
  const goalState = goalWeek === null ? null : (goalWeek < weeks.length ? weeks[goalWeek] : end);
  return { T, weeks, end, goalWeek, goalState, start };
}
const monthsText = w => w < 6 ? `約${w}週間` : `約${Math.round(w / WPM * 2) / 2}か月`;

/* ---------- meals ---------- */
// k/p/f/c: 1単位あたり（u==='g' は100gあたり）の kcal・たんぱく質・脂質・炭水化物（日本食品標準成分表などをもとにした概算）
// a:[最小,最大,刻み] b:基本量 s:h=自炊 c=コンビニ b=どちらも t:除外タグ
const FOOD = {
  rice: { n: 'ご飯', u: 'g', k: 156, p: 2.5, f: 0.3, c: 37.1, a: [100, 350, 10], b: 150, s: 'b' },
  genmai: { n: '玄米ご飯', u: 'g', k: 152, p: 2.8, f: 1.0, c: 35.6, a: [100, 350, 10], b: 150, s: 'h' },
  bread: { n: '食パン（6枚切り）', u: '枚', k: 149, p: 5.3, f: 2.5, c: 27.8, a: [1, 2, 1], b: 1, s: 'b', t: ['wheat'] },
  oat: { n: 'オートミール', u: 'g', k: 350, p: 13.7, f: 5.7, c: 69.1, a: [30, 80, 10], b: 40, s: 'h' },
  onigiri: { n: 'おにぎり（鮭・梅など）', u: '個', k: 175, p: 4.5, f: 1.5, c: 36, a: [1, 3, 1], b: 2, s: 'c' },
  udon: { n: 'うどん（ゆで）', u: '玉', k: 190, p: 5.2, f: 0.8, c: 43.2, a: [1, 2, 0.5], b: 1, s: 'b', t: ['wheat'] },
  soba: { n: 'そば（ゆで）', u: '玉', k: 221, p: 8.2, f: 1.7, c: 44.2, a: [1, 2, 0.5], b: 1, s: 'b', t: ['wheat'] },
  pasta: { n: 'パスタ（乾麺）', u: 'g', k: 347, p: 12.9, f: 1.8, c: 73.1, a: [60, 160, 10], b: 80, s: 'h', t: ['wheat'] },
  imo: { n: 'さつまいも（蒸し）', u: 'g', k: 131, p: 1.2, f: 0.2, c: 31.9, a: [100, 300, 50], b: 100, s: 'b' },
  mune: { n: '鶏むね肉のソテー（皮なし）', u: 'g', k: 135, p: 23.3, f: 4.9, c: 1, a: [80, 200, 20], b: 120, s: 'h' },
  sasami: { n: '鶏ささみのポン酢がけ', u: 'g', k: 105, p: 23.9, f: 0.8, c: 2, a: [80, 200, 20], b: 100, s: 'h' },
  schicken: { n: 'サラダチキン', u: '個', k: 116, p: 24.2, f: 1.4, c: 0.3, a: [0.5, 2, 0.5], b: 1, s: 'c' },
  salmon: { n: '鮭の塩焼き', u: '切れ', k: 146, p: 17.9, f: 8.9, c: 0.1, a: [1, 2, 1], b: 1, s: 'h', t: ['fish'] },
  saba: { n: 'さばの塩焼き', u: '切れ', k: 210, p: 21, f: 15.3, c: 0.1, a: [1, 1, 1], b: 1, s: 'h', t: ['fish'] },
  shoga: { n: '豚の生姜焼き（もも肉）', u: 'g', k: 220, p: 20.8, f: 12, c: 6, a: [80, 160, 20], b: 100, s: 'h' },
  teri: { n: '鶏ももの照り焼き（皮なし）', u: 'g', k: 165, p: 19.2, f: 8, c: 6, a: [80, 180, 20], b: 120, s: 'h' },
  beef: { n: '牛もも肉の焼肉', u: 'g', k: 190, p: 21.5, f: 10.7, c: 4, a: [80, 160, 20], b: 100, s: 'h' },
  maguro: { n: 'まぐろ赤身の刺身', u: 'g', k: 120, p: 26.6, f: 1.4, c: 1.6, a: [60, 150, 10], b: 80, s: 'b', t: ['fish'] },
  tuna: { n: 'ツナ缶（水煮）', u: '缶', k: 49, p: 11.3, f: 0.5, c: 0.1, a: [1, 2, 1], b: 1, s: 'b', t: ['fish'] },
  sabacan: { n: 'さば缶（水煮）', u: '缶', k: 330, p: 39.8, f: 20.2, c: 0.4, a: [0.5, 1, 0.5], b: 0.5, s: 'b', t: ['fish'] },
  tofu: { n: '冷ややっこ（木綿豆腐）', u: 'g', k: 76, p: 7.3, f: 4.9, c: 2.3, a: [100, 200, 50], b: 150, s: 'b', t: ['soy'] },
  natto: { n: '納豆', u: 'パック', k: 96, p: 7.7, f: 4.5, c: 7.5, a: [1, 2, 1], b: 1, s: 'b', t: ['soy'] },
  egg: { n: 'ゆで卵', u: '個', k: 71, p: 6.1, f: 5.1, c: 0.2, a: [1, 3, 1], b: 1, s: 'b', t: ['egg'] },
  fegg: { n: '目玉焼き', u: '個', k: 89, p: 6.1, f: 7.1, c: 0.2, a: [1, 2, 1], b: 1, s: 'h', t: ['egg'] },
  yakitori: { n: '焼き鳥（塩・2本）', u: '皿', k: 150, p: 16, f: 8, c: 3, a: [1, 2, 1], b: 1, s: 'c' },
  greek: { n: 'ギリシャヨーグルト（プレーン）', u: '個', k: 90, p: 10, f: 0.3, c: 12, a: [1, 2, 1], b: 1, s: 'b', t: ['milk'] },
  yogurt: { n: 'プレーンヨーグルト（無糖）', u: 'g', k: 56, p: 3.6, f: 3.0, c: 4.9, a: [100, 200, 50], b: 100, s: 'b', t: ['milk'] },
  milk: { n: '低脂肪乳（200ml）', u: '杯', k: 87, p: 7.8, f: 2.1, c: 11.3, a: [1, 2, 1], b: 1, s: 'b', t: ['milk'] },
  soymilk: { n: '無調整豆乳（200ml）', u: '杯', k: 92, p: 7.6, f: 4.2, c: 6.5, a: [1, 1, 1], b: 1, s: 'b', t: ['soy'] },
  protein: { n: 'プロテイン（水割り）', u: '杯', k: 115, p: 21, f: 1.5, c: 3.5, a: [1, 1, 1], b: 1, s: 'b', t: ['milk'], pro: true },
  edamame: { n: '枝豆（さやを除いた量）', u: 'g', k: 125, p: 11.7, f: 6.2, c: 8.8, a: [50, 100, 50], b: 50, s: 'b', t: ['soy'] },
  cheese: { n: 'プロセスチーズ', u: '個', k: 56, p: 4.1, f: 4.7, c: 0.2, a: [1, 2, 1], b: 1, s: 'b', t: ['milk'] },
  pbar: { n: 'プロテインバー', u: '本', k: 200, p: 15, f: 9, c: 15, a: [1, 1, 1], b: 1, s: 'c', t: ['milk', 'soy'] },
  nuts: { n: '素焼きミックスナッツ（20g）', u: '袋', k: 121, p: 4, f: 10.8, c: 3, a: [1, 2, 1], b: 1, s: 'b' },
  salad: { n: 'グリーンサラダ（ノンオイルドレッシング）', u: '皿', k: 40, p: 1.2, f: 0.2, c: 8, a: [1, 1, 1], b: 1, s: 'b' },
  csalad: { n: 'カップサラダ（ドレッシング付き）', u: '個', k: 70, p: 2, f: 4, c: 7, a: [1, 1, 1], b: 1, s: 'c' },
  broc: { n: 'ゆでブロッコリー（ポン酢）', u: '皿', k: 28, p: 3.3, f: 0.3, c: 4.4, a: [1, 1, 1], b: 1, s: 'h' },
  spin: { n: 'ほうれん草のおひたし', u: '皿', k: 20, p: 2, f: 0.3, c: 3, a: [1, 1, 1], b: 1, s: 'h' },
  yasai: { n: '野菜炒め', u: '皿', k: 90, p: 2.5, f: 4.5, c: 10, a: [1, 1, 1], b: 1, s: 'h' },
  kinpira: { n: 'きんぴらごぼう', u: '皿', k: 80, p: 1.5, f: 3.5, c: 10, a: [1, 1, 1], b: 1, s: 'b' },
  hijiki: { n: 'ひじきの煮物', u: '皿', k: 70, p: 3, f: 3, c: 8, a: [1, 1, 1], b: 1, s: 'b', t: ['soy'] },
  tomato: { n: 'ミニトマト（5個）', u: '皿', k: 15, p: 0.6, f: 0.1, c: 3.6, a: [1, 1, 1], b: 1, s: 'b' },
  kinoko: { n: 'きのこのソテー', u: '皿', k: 45, p: 2, f: 3, c: 4, a: [1, 1, 1], b: 1, s: 'h' },
  miso: { n: 'わかめと豆腐の味噌汁', u: '杯', k: 45, p: 3.5, f: 1.8, c: 4.5, a: [1, 1, 1], b: 1, s: 'b', t: ['soy'] },
  imiso: { n: 'インスタント味噌汁', u: '杯', k: 30, p: 2, f: 1, c: 4, a: [1, 1, 1], b: 1, s: 'c', t: ['soy'] },
  tonjiru: { n: '具だくさん豚汁', u: '杯', k: 120, p: 7, f: 6, c: 9, a: [1, 1, 1], b: 1, s: 'b', t: ['soy'] },
  soup: { n: '野菜スープ（コンソメ）', u: '杯', k: 35, p: 1.2, f: 0.5, c: 6.5, a: [1, 1, 1], b: 1, s: 'b' },
  egsoup: { n: 'かき玉スープ', u: '杯', k: 50, p: 3.5, f: 2.5, c: 3.5, a: [1, 1, 1], b: 1, s: 'h', t: ['egg'] },
  banana: { n: 'バナナ', u: '本', k: 93, p: 1.1, f: 0.2, c: 22.5, a: [1, 1, 1], b: 1, s: 'b' },
  kiwi: { n: 'キウイ', u: '個', k: 43, p: 0.9, f: 0.2, c: 11, a: [1, 1, 1], b: 1, s: 'b' },
  mikan: { n: 'みかん', u: '個', k: 39, p: 0.6, f: 0.1, c: 9.6, a: [1, 2, 1], b: 1, s: 'b' },
  apple: { n: 'りんご（1/2個）', u: '皿', k: 66, p: 0.1, f: 0.3, c: 19, a: [1, 1, 1], b: 1, s: 'b' }
};
const NG = { egg: '卵', milk: '乳製品', fish: '魚介', soy: '大豆', wheat: '小麦' };
const MEAL_STYLE = { home: '自炊中心', conv: 'コンビニ・外食中心', mix: 'どちらも' };
// 献立の型。r: [役割, 候補(スペース区切り), 'R'=必須 / 'O'=なくても可]。役割 st 以外は1日の中でなるべく重ならないようにする
const MEALPAT = [
  { slot: 'B', n: '和の朝ごはん', s: 'b', r: [['st', 'rice genmai', 'R'], ['mn', 'natto salmon tofu', 'R'], ['mn', 'egg fegg'], ['sp', 'miso soup egsoup'], ['fr', 'mikan kiwi', 'O']] },
  { slot: 'B', n: 'トーストの朝ごはん', s: 'b', r: [['st', 'bread', 'R'], ['mn', 'fegg egg schicken', 'R'], ['mn', 'greek yogurt'], ['sd', 'tomato salad'], ['fr', 'banana kiwi', 'O']] },
  { slot: 'B', n: 'オートミールの朝ごはん', s: 'h', r: [['st', 'oat', 'R'], ['mn', 'milk soymilk', 'R'], ['mn', 'egg greek'], ['fr', 'banana kiwi', 'O']] },
  { slot: 'B', n: 'コンビニの朝ごはん', s: 'c', r: [['st', 'onigiri', 'R'], ['mn', 'schicken egg', 'R'], ['mn', 'greek milk soymilk'], ['fr', 'banana', 'O']] },
  { slot: 'L', n: 'お弁当・定食', s: 'h', r: [['st', 'rice genmai', 'R'], ['mn', 'mune teri shoga salmon saba sasami', 'R'], ['sd', 'broc spin kinpira hijiki salad'], ['sp', 'miso soup', 'O'], ['mn', 'egg natto', 'O']] },
  { slot: 'L', n: 'そば・うどんのセット', s: 'b', r: [['st', 'soba udon', 'R'], ['mn', 'egg sasami tofu schicken', 'R'], ['sd', 'salad spin'], ['fr', 'mikan', 'O']] },
  { slot: 'L', n: '丼ぶり', s: 'b', r: [['st', 'rice', 'R'], ['mn', 'maguro teri beef', 'R'], ['sd', 'salad kinpira'], ['sp', 'miso', 'O']] },
  { slot: 'L', n: 'パスタランチ', s: 'h', r: [['st', 'pasta', 'R'], ['mn', 'tuna mune', 'R'], ['sd', 'salad broc'], ['sp', 'soup', 'O']] },
  { slot: 'L', n: 'コンビニランチ', s: 'c', r: [['st', 'onigiri', 'R'], ['mn', 'schicken yakitori', 'R'], ['mn', 'egg tofu', 'O'], ['sd', 'csalad'], ['sp', 'imiso soup', 'O']] },
  { slot: 'D', n: '和定食', s: 'h', r: [['st', 'rice genmai', 'R'], ['mn', 'salmon saba mune shoga teri beef maguro', 'R'], ['sd', 'broc spin yasai kinpira hijiki kinoko'], ['sp', 'miso tonjiru soup egsoup', 'O'], ['mn', 'tofu natto', 'O']] },
  { slot: 'D', n: '洋風の夕食', s: 'h', r: [['st', 'rice pasta', 'R'], ['mn', 'mune teri beef', 'R'], ['sd', 'salad broc kinoko'], ['sp', 'soup egsoup', 'O'], ['mn', 'egg tofu', 'O']] },
  { slot: 'D', n: 'コンビニ・お惣菜の夕食', s: 'c', r: [['st', 'rice onigiri', 'R'], ['mn', 'schicken yakitori sabacan', 'R'], ['mn', 'tofu natto egg', 'O'], ['sd', 'csalad hijiki kinpira'], ['sp', 'imiso tonjiru', 'O']] },
  { slot: 'S', n: '間食', s: 'b', r: [['mn', 'greek protein schicken egg soymilk pbar', 'O'], ['mn', 'yogurt edamame cheese', 'O'], ['fr', 'banana kiwi mikan apple', 'O'], ['st', 'onigiri imo', 'O'], ['x', 'nuts', 'O']] },
  { slot: '*', n: 'シンプルな食事', s: 'b', r: [['st', 'rice', 'R'], ['mn', 'maguro tofu natto egg schicken mune sasami', 'R'], ['sd', 'salad tomato'], ['fr', 'banana', 'O']] }
];
const MEAL_SLOTS = [
  { id: 'B', n: '朝食', k: 0.25, p: 0.25 },
  { id: 'L', n: '昼食', k: 0.35, p: 0.3 },
  { id: 'D', n: '夕食', k: 0.30, p: 0.3 },
  { id: 'S', n: '間食', k: 0.10, p: 0.15 }
];
const K_MSEED = 'kintoreF1.mealSeed';
function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function rng(seed) { let a = seed; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const fmul = (f, a) => (f.u === 'g' ? a / 100 : a);
function amtLabel(f, a) {
  if (f.u === 'g') return `${a}g`;
  const s = a === 0.5 ? '1/2' : a === 1.5 ? '1と1/2' : String(a);
  return s + f.u;
}
function foodOk(p, id) {
  const f = FOOD[id];
  if (!f) return false;
  if (f.pro && !p.protein) return false;
  if ((f.t || []).some(t => (p.ng || []).includes(t))) return false;
  const st = p.meal || 'mix';
  return f.s === 'b' || st === 'mix' || (st === 'home' && f.s === 'h') || (st === 'conv' && f.s === 'c');
}
function patOk(p, pt) { const st = p.meal || 'mix'; return pt.s === 'b' || st === 'mix' || (st === 'home' && pt.s === 'h') || (st === 'conv' && pt.s === 'c'); }
// 候補の量をすべて試して、kcal・たんぱく質・脂質の目標に一番近い組み合わせを選ぶ
function solveMeal(chosen, tgt) {
  const opts = chosen.map(c => { const [mn, mx, st] = c.f.a, o = []; for (let a = mn; a <= mx + 1e-9; a += st) o.push(Math.round(a * 10) / 10); return c.opt ? [0, ...o] : o; });
  const sq = x => x * x, n = chosen.length, idx = new Array(n).fill(0);
  let best = null, bestE = Infinity;
  const rec = (i, K, P, F, pen) => {
    if (i === n) {
      const e = sq((K - tgt.k) / Math.max(tgt.k, 150)) + 1.0 * sq((P - tgt.p) / Math.max(tgt.p, 8)) + 0.15 * sq((F - tgt.f) / Math.max(tgt.f, 8)) + pen;
      if (e < bestE) { bestE = e; best = idx.slice(); }
      return;
    }
    const c = chosen[i], f = c.f, range = f.a[1] - f.a[0];
    for (let j = 0; j < opts[i].length; j++) {
      const a = opts[i][j], m = fmul(f, a);
      idx[i] = j;
      const pn = (range > 0 && a > 0 ? 0.004 * sq((a - f.b) / range) : 0) + (a === 0 ? 0.004 : 0);
      rec(i + 1, K + f.k * m, P + f.p * m, F + f.f * m, pen + pn);
    }
  };
  rec(0, 0, 0, 0, 0);
  return chosen.map((c, i) => ({ id: c.id, a: opts[i][best[i]] })).filter(x => x.a > 0);
}
function mealPlan(p, d) {
  const seeds = LS.get(K_MSEED, {}), used = new Set(), meals = [];
  let K = 0, P = 0, F = 0, C = 0;
  for (let si = 0; si < MEAL_SLOTS.length; si++) {
    const sl = MEAL_SLOTS[si];
    let tgt;
    if (sl.id === 'S') {
      tgt = { k: d.kcal - K, p: Math.max(0, d.P - P), f: Math.max(0, d.F - F) };
      if (tgt.k < 60) { meals.push({ slot: sl, none: true }); continue; }
    } else {
      // 残りの量を、残りの食事の割合で分ける（前の食事のずれを後の食事で吸収する）
      const rest = MEAL_SLOTS.slice(si), rk = rest.reduce((s, x) => s + x.k, 0), rp = rest.reduce((s, x) => s + x.p, 0);
      tgt = { k: Math.max(0, d.kcal - K) * sl.k / rk, p: Math.max(0, d.P - P) * sl.p / rp, f: Math.max(0, d.F - F) * sl.k / rk };
    }
    const r = rng(hashStr(`${d.date}|${sl.id}|${seeds[`${d.date}|${sl.id}`] || 0}`));
    const pats = MEALPAT.filter(pt => pt.slot === sl.id && patOk(p, pt)).map(pt => [r(), pt]).sort((a, b) => a[0] - b[0]).map(x => x[1]);
    if (sl.id !== 'S') pats.push(MEALPAT.find(pt => pt.slot === '*'));
    let chosen = null, pat = null;
    for (const pt of pats) {
      const ch = [], here = new Set();
      let ok = true;
      for (const [role, ids, flag] of pt.r) {
        const cands = ids.split(' ').filter(id => foodOk(p, id) && !here.has(id));
        if (!cands.length) { if (flag === 'R') { ok = false; break; } continue; }
        const fresh = role === 'st' ? cands : cands.filter(id => !used.has(id));
        const pool = fresh.length ? fresh : cands;
        const id = pool[Math.floor(r() * pool.length)];
        here.add(id);
        ch.push({ id, f: FOOD[id], opt: flag === 'O' });
      }
      if (ok && ch.length) { chosen = ch; pat = pt; break; }
    }
    if (!chosen) { meals.push({ slot: sl, fail: true }); continue; }
    const items = solveMeal(chosen, tgt);
    if (!items.length) { meals.push({ slot: sl, none: true }); continue; }
    const m = { slot: sl, pat, items, k: 0, p: 0, f: 0, c: 0 };
    for (const it of items) {
      const f = FOOD[it.id], x = fmul(f, it.a);
      m.k += f.k * x; m.p += f.p * x; m.f += f.f * x; m.c += f.c * x;
      if (pat.r.find(rr => rr[0] !== 'st' && rr[1].split(' ').includes(it.id))) used.add(it.id);
    }
    K += m.k; P += m.p; F += m.f; C += m.c;
    meals.push(m);
  }
  return { meals, K, P, F, C };
}

/* ---------- state ---------- */
const S = { p: null, sim: null, view: 'today', week: 0 };
function weekOfToday() {
  const off = dayDiff(S.sim.start, todayDate());
  if (off < 0) return { wi: 0, di: 0, before: true };
  const wi = Math.floor(off / 7), di = off % 7;
  if (wi >= S.sim.weeks.length) return { wi: S.sim.weeks.length - 1, di, after: true };
  return { wi, di };
}
function phaseBadge(ph) { return `<span class="badge"><i style="background:${PH[ph].color}"></i>${PH[ph].name}</span>`; }
function weekNote(w) {
  const t = ['ブロック1週目：フォームを丁寧に。回数は少なめから', '2週目：回数を少し増やす', '3週目：追い込み週。メイン種目はセット+1', 'デロード（回復）週：セットを減らして疲れを抜く'][w.wb];
  const extra = [];
  if (w.wb === 0 && w.block > 0 && S.p.dumbbell) extra.push('ダンベルの重さを前のブロックより少しアップ');
  if (w.i > 1 && (w.i - 1) % 8 === 0) extra.push('自重種目がレベルアップ');
  return t + (extra.length ? '。' + extra.join('、') : '');
}

/* ---------- rendering: meals ---------- */
const MEAL_TIP = {
  cut: '減量中のコツ：野菜や汁物から食べ始めると満腹感が出やすくなります。揚げ物・甘い飲み物は控えめに。',
  bulk: '増量中のコツ：一度に食べきれない分は間食に回してOK。炭水化物は筋トレの前後に多めに。',
  keep: '維持のコツ：週1〜2回体重を測り、増えてきたらご飯を少し減らして調整しましょう。'
};
function mealsHTML(d) {
  const mp = mealPlan(S.p, d);
  const rows = mp.meals.map(m => {
    const label = m.slot.id === 'S' && d.type === 'train' ? '間食（筋トレの後に）' : m.slot.n;
    if (m.none) return m.slot.id === 'S' ? '' : `<div class="meal"><div class="meal-h"><b>${label}</b></div><p class="tiny" style="margin:2px 0 0">この日は3食で目安に届いています。</p></div>`;
    if (m.fail) return `<div class="meal"><div class="meal-h"><b>${label}</b></div><p class="tiny" style="margin:2px 0 0">条件に合う例が見つかりませんでした。プロフィールの「食べられないもの」を見直してください。</p></div>`;
    const key = `${d.date}|${m.slot.id}`;
    return `<div class="meal"><div class="meal-h"><b>${label}</b><span class="mp">${esc(m.pat.n)}</span><span class="sp"></span><span class="mk">${num(m.k)}kcal・P${Math.round(m.p)}g</span><button class="reroll" data-reroll="${esc(key)}" aria-label="${esc(label)}の別の案" title="別の案">↻</button></div>
      <ul class="foods">${m.items.map(it => { const f = FOOD[it.id]; return `<li><span>${esc(f.n)}</span><span class="amt">${amtLabel(f, it.a)}</span></li>`; }).join('')}</ul></div>`;
  }).join('');
  const diff = Math.round(mp.K - d.kcal);
  return `<div class="meals">${rows}</div>
    <p class="tiny mtot">合計 <b>${num(mp.K)}kcal</b>（目安との差 ${diff >= 0 ? '+' : '−'}${num(Math.abs(diff))}）・たんぱく質 ${Math.round(mp.P)}g・脂質 ${Math.round(mp.F)}g・炭水化物 ${Math.round(mp.C)}g</p>`;
}

/* ---------- rendering: day ---------- */
function rxText(it) {
  const amt = it.u === 'sec' ? `${it.tgt}秒` : `${it.tgt}回`;
  let s = `<b>${amt} × ${it.sets}セット</b>${it.side ? '（左右それぞれ）' : ''}`;
  if (it.db) s += ` ・ <span class="w">${it.single ? 'ダンベル1個' : '片手'} ${it.kg}kg</span>`;
  s += ` ・ <span class="w">休憩${it.rest}秒</span>`;
  return s;
}
function dayCard(d, opts = {}) {
  const date = parseYmd(d.date), isToday = d.date === ymd(todayDate());
  const done = LS.get(K_DONE, {});
  let body = '', doneN = 0, total = 0;
  if (d.type === 'train') {
    const lis = [];
    lis.push(`<li class="wu">🔥 ウォームアップ 5分：肩回し・腕振り・股関節回し・軽いスクワット10回</li>`);
    d.items.forEach((it, i) => {
      const key = `${d.date}#${i}`, on = !!done[key]; total++; if (on) doneN++;
      const maxNote = it.maxed ? `<div class="tiny">※手持ちの最大重量です。下ろす動きを3秒かけて、回数を+2回して負荷を上げましょう。</div>` : '';
      lis.push(`<li class="${on ? 'is-done' : ''}"><label class="chk"><input type="checkbox" data-k="${esc(key)}" ${on ? 'checked' : ''} aria-label="${esc(it.n)} 完了"><span></span></label>
        <div class="ex-b"><div class="ex-n">${esc(it.n)}<span class="role">${ROLE[it.role]}</span></div><div class="ex-rx">${rxText(it)}</div>${maxNote}
        <details class="tip"><summary>やり方</summary><p>${esc(it.tip)}</p></details></div></li>`);
    });
    if (d.fin) {
      const key = `${d.date}#fin`, on = !!done[key]; total++; if (on) doneN++;
      lis.push(`<li class="${on ? 'is-done' : ''}"><label class="chk"><input type="checkbox" data-k="${esc(key)}" ${on ? 'checked' : ''} aria-label="フィニッシャー 完了"><span></span></label>
        <div class="ex-b"><div class="ex-n">${esc(d.fin.n)}</div><div class="ex-rx">${esc(d.fin.desc)}</div></div></li>`);
    }
    lis.push(`<li class="wu">🧘 クールダウン 3分：使った部位をそれぞれ20秒ずつストレッチ</li>`);
    body = `<div class="meta">約${d.min}分 ・ 運動で約${num(d.exKcal)}kcal消費 ・ 「あと2回できる」くらいで止めるのが目安</div><ol class="ex">${lis.join('')}</ol>`;
  } else {
    const key = `${d.date}#rest`, on = !!done[key]; total = 1; doneN = on ? 1 : 0;
    body = `<ol class="ex"><li class="${on ? 'is-done' : ''}"><label class="chk"><input type="checkbox" data-k="${esc(key)}" ${on ? 'checked' : ''} aria-label="休養日の活動 完了"><span></span></label>
      <div class="ex-b"><div class="ex-n">${esc(d.act)}</div><div class="ex-rx">${esc(d.actNote)}${d.exKcal ? ` 約${num(d.exKcal)}kcal消費。` : ''}</div></div></li></ol>`;
  }
  const pfc = `<div class="meta">たんぱく質 ${d.P}g ・ 脂質 ${d.F}g ・ 炭水化物 ${d.C}g</div>`;
  const head = `<div class="day-d"><b>${md(date)}</b><span>${DOW[date.getDay()]}曜日</span></div>
    <div class="day-t"><b>${esc(d.name)}${isToday ? '<span class="tag-today">今日</span>' : ''}</b><span>${d.type === 'train' ? esc(d.focus) : esc(d.act)}</span>${doneN && doneN === total ? '<span class="done-n">✓ 完了</span>' : doneN ? `<span class="done-n">${doneN}/${total} 完了</span>` : ''}</div>
    <div class="day-k"><b>${num(d.kcal)}</b><span>kcal</span></div>`;
  if (opts.flat) return `<article class="day ${isToday ? 'today' : ''}"><div class="day-h" style="cursor:default">${head}</div><div class="day-body">${pfc}${body}</div></article>`;
  const meals = `<details class="mealbox"><summary>🍽 この日の食事の例</summary>${mealsHTML(d)}</details>`;
  return `<details class="day ${isToday ? 'today' : ''}" ${opts.open ? 'open' : ''}><summary class="day-h">${head}<span class="chev" aria-hidden="true">›</span></summary><div class="day-body">${pfc}${body}${meals}</div></details>`;
}

/* ---------- views ---------- */
function renderToday() {
  const el = $('#v-today'), sim = S.sim;
  const { wi, di, before, after } = weekOfToday();
  const w = sim.weeks[wi], d = w.days[di];
  const notes = [];
  if (before) notes.push(`プランは ${mdw(sim.start)} から始まります。初日の内容を表示しています。`);
  if (after) notes.push('プランの期間が終わりました。最終週と同じ曜日の内容を表示しています。プロフィールから新しいプランを作れます。');
  const left = sim.goalWeek === null ? null : sim.goalWeek - wi;
  const progress = sim.goalWeek === null ? '目標まで3年以上かかる見込み' : left > 0 ? `目標達成まで あと${monthsText(left)}` : '目標達成！ 維持期です';
  const deficit = d.bal < 0 ? `− 減量分 ${num(-d.bal)}` : d.bal > 0 ? `＋ 増量分 ${num(d.bal)}` : '± 0（維持）';
  const logs = LS.get(K_WEIGHT, {}), tkey = ymd(todayDate());
  const pred = predictedAt(todayDate());
  let wmsg = '';
  if (logs[tkey] != null && pred != null) {
    const diff = logs[tkey] - pred;
    wmsg = `<p class="small" style="margin:8px 0 0">記録 <b>${r1(logs[tkey])}kg</b>（予測 ${r1(pred)}kg との差 ${diff >= 0 ? '+' : '−'}${r1(Math.abs(diff))}kg）</p>`;
    if (Math.abs(diff) >= 1.5) wmsg += `<p class="tiny">予測から1.5kg以上ずれています。今日の体重から計画を作り直すと、カロリーとメニューが今の体に合わせて調整されます。</p><button class="btn sub" id="replan" style="margin-top:6px">今日の体重で計画を作り直す</button>`;
  }
  el.innerHTML = `
    ${notes.map(n => `<div class="note">${esc(n)}</div>`).join('')}
    <div class="card">
      <div class="row" style="margin-bottom:6px"><div class="badges"><span class="badge plain">第${w.i}週・${di + 1}日目</span>${phaseBadge(w.phase)}${w.deload ? '<span class="badge plain">デロード週</span>' : ''}</div></div>
      <div class="hero-l">今日の摂取カロリーの目安（${mdw(parseYmd(d.date))}）</div>
      <div class="hero">${num(d.kcal)}<small>kcal</small></div>
      <div class="tiny">消費の見込み ${num(d.tdee)}kcal（基礎代謝 ${num(w.bmr)} × 生活活動 ${PAL[S.p.activity]} ＋ 運動 ${num(d.exKcal)}） ${deficit}</div>
      <div class="tiles">
        <div class="tile"><div class="l">たんぱく質</div><div class="v">${d.P}<small>g</small></div><div class="s">${num(d.P * 4)}kcal</div></div>
        <div class="tile"><div class="l">脂質</div><div class="v">${d.F}<small>g</small></div><div class="s">${num(d.F * 9)}kcal</div></div>
        <div class="tile"><div class="l">炭水化物</div><div class="v">${d.C}<small>g</small></div><div class="s">${num(d.C * 4)}kcal</div></div>
      </div>
    </div>
    <div class="card">
      <div class="row"><h2 style="margin:0">今日の食事の例</h2><span class="sp"></span><span class="tiny">${esc(MEAL_STYLE[S.p.meal || 'mix'])}</span></div>
      ${mealsHTML(d)}
      <p class="tiny" style="margin:6px 0 0">${esc(MEAL_TIP[w.phase])}<br>「↻」で別の案に変えられます。ご飯は茶碗1杯≈150g。栄養価は概算です。</p>
    </div>
    ${dayCard(d, { flat: true })}
    <div class="card">
      <h2>体重を記録</h2>
      <div class="inl"><input type="number" id="wIn" inputmode="decimal" step="0.1" min="20" max="250" placeholder="${pred != null ? r1(pred) : ''}" value="${logs[tkey] != null ? logs[tkey] : ''}" aria-label="今日の体重（kg）"><button id="wSave">記録</button></div>
      <p class="tiny" style="margin:6px 0 0">週に1〜2回、同じ時間（朝のトイレ後など）に測ると比べやすいです。記録は「計画」のグラフに点で表示されます。</p>
      ${wmsg}
    </div>
    <div class="card"><div class="row"><div><div class="hero-l">${esc(GOALS[S.p.goal][S.p.sex].name)} を目指して</div><b>${progress}</b></div></div><p class="tiny" style="margin:6px 0 0">${esc(PH[w.phase].desc)}</p></div>`;
}
function predictedAt(date) {
  const sim = S.sim, x = dayDiff(sim.start, date) / 7;
  if (x < 0) return null;
  const n = sim.weeks.length;
  if (x >= n) return sim.end.W;
  const k = Math.floor(x), a = sim.weeks[k].W, b = k + 1 < n ? sim.weeks[k + 1].W : sim.end.W;
  return a + (b - a) * (x - k);
}
function renderWeek() {
  const el = $('#v-week'), sim = S.sim, n = sim.weeks.length;
  S.week = clamp(S.week, 0, n - 1);
  const w = sim.weeks[S.week];
  const opts = sim.weeks.map((x, k) => `<option value="${k}" ${k === S.week ? 'selected' : ''}>第${x.i}週　${md(x.start)}〜${md(addDays(x.start, 6))}　${PH[x.phase].short}${sim.goalWeek === k ? '（目標達成）' : ''}</option>`).join('');
  const today = ymd(todayDate());
  const trainN = w.days.filter(d => d.type === 'train').length;
  el.innerHTML = `
    <div class="wnav"><button id="wPrev" aria-label="前の週" ${S.week === 0 ? 'disabled' : ''}>‹</button><select id="wSel" aria-label="週を選ぶ">${opts}</select><button id="wNext" aria-label="次の週" ${S.week === n - 1 ? 'disabled' : ''}>›</button></div>
    <div class="card">
      <div class="badges" style="margin-bottom:8px">${phaseBadge(w.phase)}${w.deload ? '<span class="badge plain">デロード週</span>' : ''}<span class="badge plain">筋トレ ${trainN}日</span></div>
      <dl class="kv">
        <dt>週はじめの予測体重</dt><dd>${r1(w.W)} kg</dd>
        <dt>予測体脂肪率</dt><dd>${r1(w.bf)} %</dd>
        <dt>1日の摂取カロリー（平均）</dt><dd>${num(w.avgKcal)} kcal</dd>
        <dt>たんぱく質</dt><dd>${w.days[0].P} g／日</dd>
      </dl>
      <p class="small muted" style="margin:10px 0 0">📌 ${esc(weekNote(w))}</p>
    </div>
    ${w.days.map(d => dayCard(d, { open: d.date === today })).join('')}
    <p class="tiny">トレーニング日はカロリーを少し多め（主に炭水化物）、休養日は少なめにしています。1週間の平均で目標ペースになるように調整済みです。</p>`;
}
function renderPlan() {
  const el = $('#v-plan'), sim = S.sim, p = S.p, T = sim.T, g = GOALS[p.goal][p.sex];
  const gs = sim.goalState;
  const when = sim.goalWeek === null ? null : addDays(sim.start, 7 * sim.goalWeek);
  const heroTxt = sim.goalWeek === null ? '3年以上' : sim.goalWeek === 0 ? '達成済み' : monthsText(sim.goalWeek);
  // phase runs
  const runs = [];
  sim.weeks.forEach(w => { const l = runs[runs.length - 1]; if (l && l.ph === w.phase) l.n++; else runs.push({ ph: w.phase, n: 1 }); });
  const phSeen = [...new Set(runs.map(r => r.ph))];
  const pbar = runs.map(r => `<div style="flex:${r.n};background:${PH[r.ph].color}" title="${PH[r.ph].name} ${r.n}週" aria-label="${PH[r.ph].name} ${r.n}週">${PH[r.ph].short} ${r.n}週</div>`).join('');
  const nTrain = orderedDays(p).length;
  const warn = [...T.notes];
  const bmi = p.weight / h2of(p);
  if (p.age < 18) warn.push('18歳未満は成長期のため、減量ペースを控えめにしています。食事を極端に減らさないでください。');
  if (gs && gs.W / h2of(p) < 18.5) warn.push(`目標体重のBMIが ${r1(gs.W / h2of(p))} と低めです。やせすぎに注意し、無理のない目標も検討してください。`);
  if (bmi >= 30) warn.push('BMIが30以上の場合、膝や腰への負担を避けるため、ジャンプ系は控えめにしています。持病がある場合は医師に相談してから始めてください。');
  if (sim.goalWeek === null) warn.push('今の設定だと3年以上かかる見込みです。まずは「細マッチョ」「引き締めボディ」など手前の目標を設定し、達成したら次の目標へ進むのがおすすめです。');
  const rows = sim.weeks.map((w, k) => `<tr><td>${w.i}</td><td>${md(w.start)}</td><td>${PH[w.phase].short}${w.deload ? '・回復' : ''}</td><td>${r1(w.W)}</td><td>${r1(w.bf)}</td><td>${num(w.avgKcal)}</td></tr>`).join('');
  el.innerHTML = `
    <div class="card">
      <div class="hero-l">「${esc(g.name)}」までの期間の目安</div>
      <div class="hero">${heroTxt}</div>
      <div class="tiny">${when && sim.goalWeek > 0 ? `${when.getFullYear()}年${when.getMonth() + 1}月ごろ（${sim.goalWeek}週間）に到達する見込み` : sim.goalWeek === 0 ? 'すでに目標の体型に近いので、維持しながら筋力を伸ばすプランです' : ''}</div>
      <dl class="kv" style="margin-top:12px">
        <dt>いま</dt><dd>${r1(p.weight)}kg ・ 体脂肪率 ${r1(T.bf0)}%${T.estimated ? '（推定）' : ''}</dd>
        <dt>目標</dt><dd>${gs ? `${r1(gs.W)}kg ・ 体脂肪率 ${r1(gs.bf)}%` : '—'}</dd>
        <dt>筋肉など（除脂肪量）</dt><dd>${r1(T.L0)} → ${gs ? r1(gs.L) : r1(sim.end.L)} kg</dd>
      </dl>
      ${warn.map(n => `<div class="note">${esc(n)}</div>`).join('')}
    </div>
    <div class="card">
      <h2>体重の予測</h2>
      <div class="legend" id="lg">${phSeen.map(ph => `<span><i class="sw" style="background:${PH[ph].color}"></i>${PH[ph].name}</span>`).join('')}<span><i class="lk" style="border-color:var(--muted)"></i>目標体重</span><span id="lgLog" hidden><i class="dk"></i>記録した体重</span></div>
      <div class="pbar" role="img" aria-label="期の流れ：${runs.map(r => `${PH[r.ph].name}${r.n}週`).join('、')}">${pbar}</div>
      <div class="chart-wrap"><div id="chart"></div><div class="tt" id="tt" role="status" aria-live="polite"></div></div>
      <details class="more"><summary>週ごとの表を見る</summary><div class="tblbox"><table class="tbl"><thead><tr><th>週</th><th>開始</th><th>期</th><th>体重kg</th><th>体脂肪%</th><th>kcal/日</th></tr></thead><tbody>${rows}</tbody></table></div></details>
    </div>
    <div class="card">
      <h2>トレーニングの方針</h2>
      <dl class="kv">
        <dt>タイプ</dt><dd>${esc(STY[T.style].label)}</dd>
        <dt>週${nTrain}日</dt><dd>${esc(SPLIT_LABEL[nTrain] || '')}</dd>
        <dt>器具</dt><dd>${p.dumbbell ? `自重＋ダンベル（最大 ${p.dbMax}kg）` : '自重のみ'}</dd>
      </dl>
      <div class="prose">
        <p>4週間を1ブロックとして、1〜3週目で回数とセットを少しずつ増やし、4週目は疲れを抜く「デロード週」にしています。${p.dumbbell ? 'ブロックが変わるたびにダンベルの重さを約6%上げます。' : ''}自重種目は8週間ごとに1段階むずかしい種目に進みます。</p>
        <p>メニューの回数が楽にこなせるようになったら、表示より早く次の段階に進んでOKです。痛みが出たら中止してください。</p>
      </div>
    </div>
    <div class="card">
      <details class="more"><summary>計算のしくみ</summary>
      <div class="prose">
        <ul>
          <li>基礎代謝：国立健康・栄養研究所の式（日本人向け）。いまは約${num(sim.weeks[0].bmr)}kcal/日。</li>
          <li>消費カロリー：基礎代謝 × 生活活動（${PAL[p.activity]}：${esc(PAL_LABEL[p.activity])}）＋ その日の運動。</li>
          <li>体脂肪率：入力がなければBMI・年齢・性別から推定（Deurenbergの式）。体組成計の値を入れると精度が上がります。</li>
          <li>減量期は1週間に体重の0.5〜0.75%ずつ落とすペース。摂取カロリーは基礎代謝（最低${p.sex === 'm' ? '1,500' : '1,200'}kcal）を下回らないようにしています。</li>
          <li>増量期は1日あたり約150〜250kcal多めに食べ、筋肉が増えるペース（経験・年齢・性別で変化）に合わせています。体脂肪が増えすぎたら短い減量期を挟みます。</li>
          <li>たんぱく質は体重1kgあたり${p.sex === 'm' ? '1.8〜2.0' : '1.6〜1.8'}g、脂質はカロリーの25%、残りを炭水化物にしています。</li>
        </ul>
        <p>あくまで目安です。体重の記録が予測とずれてきたら「今日」の画面から計画を作り直せます。持病のある方や妊娠中の方は医師に相談してください。</p>
      </div></details>
    </div>`;
  // 入りきらないラベルは切らずに消す（期の名前は凡例・ツールチップ・表で読める）
  $$('.pbar div', el).forEach(d => { if (d.scrollWidth > d.clientWidth + 1) d.textContent = ''; });
  requestAnimationFrame(drawChart);
}

/* ---------- chart ---------- */
const SVGNS = 'http://www.w3.org/2000/svg';
function svgEl(tag, attrs, parent) {
  const e = document.createElementNS(SVGNS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
}
function drawChart() {
  const box = $('#chart');
  if (!box || !S.sim || !box.clientWidth) return;
  const sim = S.sim, n = sim.weeks.length;
  const pts = sim.weeks.map((w, k) => ({ x: k, y: w.W, ph: w.phase, bf: w.bf, date: w.start }));
  pts.push({ x: n, y: sim.end.W, ph: sim.weeks[n - 1].phase, bf: sim.end.bf, date: addDays(sim.start, 7 * n) });
  const logs = Object.entries(LS.get(K_WEIGHT, {})).map(([d, kg]) => ({ x: dayDiff(sim.start, parseYmd(d)) / 7, y: kg, d })).filter(o => o.x >= 0 && o.x <= n).sort((a, b) => a.x - b.x);
  $('#lgLog').hidden = !logs.length;
  const gs = sim.goalState, tw = gs ? gs.W : null;
  const ys = pts.map(o => o.y).concat(logs.map(o => o.y)); if (tw != null) ys.push(tw);
  let lo = Math.min(...ys), hi = Math.max(...ys);
  const pad = Math.max(0.4, (hi - lo) * 0.08); lo -= pad; hi += pad;
  const step = [0.5, 1, 2, 5, 10, 20].find(s => (hi - lo) / s <= 5) || 20;
  lo = Math.floor(lo / step) * step; hi = Math.ceil(hi / step) * step;
  const Wd = box.clientWidth, H = box.clientHeight || 230, m = { l: 40, r: 14, t: 22, b: 26 };
  const X = x => m.l + (Wd - m.l - m.r) * x / n, Y = y => m.t + (H - m.t - m.b) * (hi - y) / (hi - lo);
  box.innerHTML = '';
  const svg = svgEl('svg', { viewBox: `0 0 ${Wd} ${H}`, role: 'img', 'aria-label': `体重の予測グラフ。${r1(pts[0].y)}kgから${tw != null ? `${sim.goalWeek}週後に${r1(tw)}kg` : `${n}週後に${r1(sim.end.W)}kg`}` }, box);
  // y grid + ticks
  for (let v = lo; v <= hi + 1e-9; v += step) {
    const y = Y(v);
    svgEl('line', { x1: m.l, x2: Wd - m.r, y1: y, y2: y, stroke: v === lo ? 'var(--axis)' : 'var(--grid)', 'stroke-width': 1, 'shape-rendering': 'crispEdges' }, svg);
    const t = svgEl('text', { x: m.l - 6, y: y + 4, 'text-anchor': 'end', 'font-size': 11, fill: 'var(--muted)', style: 'font-variant-numeric:tabular-nums' }, svg);
    t.textContent = step < 1 ? v.toFixed(1) : String(Math.round(v));
  }
  const ul = svgEl('text', { x: m.l - 6, y: 9, 'text-anchor': 'end', 'font-size': 10, fill: 'var(--muted)' }, svg); ul.textContent = 'kg';
  // x ticks (months)
  const totalM = n / WPM;
  if (totalM < 2) {
    const sw = n <= 6 ? 1 : 2;
    for (let k = 0; k <= n; k += sw) { const t = svgEl('text', { x: X(k), y: H - 6, 'text-anchor': k === 0 ? 'start' : 'middle', 'font-size': 11, fill: 'var(--muted)' }, svg); t.textContent = k === 0 ? '開始' : `${k}週`; }
  } else {
    const sm = [1, 2, 3, 6, 12].find(s => totalM / s <= 5) || 12;
    for (let mo = 0; mo * WPM <= n + 1e-9; mo += sm) { const t = svgEl('text', { x: X(mo * WPM), y: H - 6, 'text-anchor': mo === 0 ? 'start' : 'middle', 'font-size': 11, fill: 'var(--muted)' }, svg); t.textContent = mo === 0 ? '開始' : `${mo}か月`; }
  }
  // target line
  if (tw != null) {
    svgEl('line', { x1: m.l, x2: Wd - m.r, y1: Y(tw), y2: Y(tw), stroke: 'var(--muted)', 'stroke-width': 1, 'shape-rendering': 'crispEdges' }, svg);
    const above = Y(tw) - m.t > 18;
    const t = svgEl('text', { x: Wd - m.r, y: above ? Y(tw) - 5 : Y(tw) + 14, 'text-anchor': 'end', 'font-size': 11, fill: 'var(--ink2)' }, svg);
    t.textContent = `目標 ${r1(tw)}kg`;
  }
  // phase-colored line segments
  let k0 = 0;
  for (let k = 1; k <= n; k++) {
    if (k === n || sim.weeks[k].phase !== sim.weeks[k0].phase) {
      const d = pts.slice(k0, k + 1).map((o, j) => `${j ? 'L' : 'M'}${X(o.x).toFixed(1)},${Y(o.y).toFixed(1)}`).join('');
      svgEl('path', { d, fill: 'none', stroke: PH[sim.weeks[k0].phase].color, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, svg);
      k0 = k;
    }
  }
  // goal marker
  if (gs && sim.goalWeek > 0) {
    svgEl('circle', { cx: X(sim.goalWeek), cy: Y(gs.W), r: 5, fill: 'var(--ph-keep)', stroke: 'var(--card)', 'stroke-width': 2 }, svg);
    const gx = X(sim.goalWeek), anchor = gx > Wd - 60 ? 'end' : gx < m.l + 40 ? 'start' : 'middle';
    const t = svgEl('text', { x: gx, y: Y(gs.W) + (Y(gs.W) > H - m.b - 22 ? -10 : 18), 'text-anchor': anchor, 'font-size': 11, fill: 'var(--ink2)' }, svg);
    t.textContent = `達成 ${monthsText(sim.goalWeek)}`;
  }
  // logged weights
  for (const o of logs) svgEl('circle', { cx: X(o.x), cy: Y(o.y), r: 4, fill: 'var(--ink)', stroke: 'var(--card)', 'stroke-width': 2 }, svg);
  // hover layer
  const cross = svgEl('line', { y1: m.t, y2: H - m.b, stroke: 'var(--axis)', 'stroke-width': 1, visibility: 'hidden' }, svg);
  const dot = svgEl('circle', { r: 4.5, stroke: 'var(--card)', 'stroke-width': 2, visibility: 'hidden' }, svg);
  const hit = svgEl('rect', { class: 'hit', x: m.l, y: 0, width: Wd - m.l - m.r, height: H, tabindex: 0, 'aria-label': 'グラフ上を触ると週ごとの数値が出ます。矢印キーでも移動できます' }, svg);
  const tt = $('#tt');
  let cur = -1;
  const show = k => {
    cur = k = clamp(k, 0, n);
    const o = pts[k], ph = k < n ? sim.weeks[k].phase : o.ph;
    cross.setAttribute('x1', X(o.x)); cross.setAttribute('x2', X(o.x)); cross.setAttribute('visibility', 'visible');
    dot.setAttribute('cx', X(o.x)); dot.setAttribute('cy', Y(o.y)); dot.setAttribute('fill', PH[ph].color); dot.setAttribute('visibility', 'visible');
    tt.textContent = '';
    const h = document.createElement('div'); h.className = 'h'; h.textContent = k === 0 ? `開始 ${md(o.date)}` : `${k}週後（${md(o.date)}）`; tt.appendChild(h);
    const row = (key, val, label) => { const r = document.createElement('div'); r.className = 'r'; if (key) { const i = document.createElement('i'); i.style.borderColor = key; r.appendChild(i); } const b = document.createElement('b'); b.textContent = val; r.appendChild(b); const e = document.createElement('em'); e.textContent = label; r.appendChild(e); tt.appendChild(r); };
    row(PH[ph].color, `${r1(o.y)}kg`, `予測・${PH[ph].name}`);
    row(null, `${r1(o.bf)}%`, '予測体脂肪率');
    const near = logs.filter(l => Math.abs(l.x - o.x) <= 0.5).pop();
    if (near) row('var(--ink)', `${r1(near.y)}kg`, `記録（${md(parseYmd(near.d))}）`);
    tt.style.display = 'block';
    const bw = box.clientWidth, tw2 = tt.offsetWidth, px = X(o.x);
    tt.style.left = clamp(px + 12 + tw2 > bw ? px - 12 - tw2 : px + 12, 0, Math.max(0, bw - tw2)) + 'px';
    tt.style.top = '4px';
  };
  const hide = () => { cross.setAttribute('visibility', 'hidden'); dot.setAttribute('visibility', 'hidden'); tt.style.display = 'none'; cur = -1; };
  const fromEvt = e => { const r = svg.getBoundingClientRect(); const px = (e.clientX - r.left) * (Wd / r.width); return Math.round((px - m.l) / (Wd - m.l - m.r) * n); };
  hit.addEventListener('pointermove', e => show(fromEvt(e)));
  hit.addEventListener('pointerdown', e => show(fromEvt(e)));
  hit.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') hide(); });
  hit.addEventListener('focus', () => show(cur < 0 ? (sim.goalWeek || 0) : cur));
  hit.addEventListener('blur', hide);
  hit.addEventListener('keydown', e => {
    if (e.key === 'ArrowRight') { show(cur + 1); e.preventDefault(); }
    else if (e.key === 'ArrowLeft') { show(cur - 1); e.preventDefault(); }
    else if (e.key === 'Escape') hide();
  });
}

/* ---------- setup form ---------- */
function renderSetup() {
  const el = $('#v-setup');
  const p = S.p || { sex: 'm', age: '', height: '', weight: '', bodyFat: '', activity: 'mid', exp: 'none', goal: 'hoso', customWeight: '', customBF: '', days: [1, 3, 5], dumbbell: false, dbMax: 10, start: ymd(todayDate()), meal: 'mix', ng: [], protein: false };
  const radio = (name, val, label, cur) => `<label><input type="radio" name="${name}" value="${val}" ${cur === val ? 'checked' : ''}><span>${label}</span></label>`;
  el.innerHTML = `
    ${S.p ? '' : `<div class="card"><h2>はじめに</h2><p class="small muted" style="margin:0">身長・体重と目指す体型を入れると、何か月で理想の体型になれるかを計算し、1週間ごとの筋トレメニュー（自重・ダンベル）と毎日の摂取カロリーを作ります。データはこの端末の中だけに保存されます。</p></div>`}
    <form id="pf" class="card" novalidate>
      <h2>あなたについて</h2>
      <div class="f"><span class="lbl">性別</span><div class="seg">${radio('sex', 'm', '男性', p.sex)}${radio('sex', 'f', '女性', p.sex)}</div></div>
      <div class="f two">
        <div><label for="age">年齢</label><input type="number" id="age" inputmode="numeric" min="13" max="90" value="${esc(p.age)}" placeholder="例 25"></div>
        <div><label for="height">身長（cm）</label><input type="number" id="height" inputmode="decimal" step="0.1" min="120" max="220" value="${esc(p.height)}" placeholder="例 170"></div>
      </div>
      <div class="f two">
        <div><label for="weight">体重（kg）</label><input type="number" id="weight" inputmode="decimal" step="0.1" min="30" max="200" value="${esc(p.weight)}" placeholder="例 70"></div>
        <div><label for="bodyFat">体脂肪率（%・任意）</label><input type="number" id="bodyFat" inputmode="decimal" step="0.1" min="3" max="60" value="${esc(p.bodyFat || '')}" placeholder="空欄なら推定"></div>
      </div>
      <div class="hint" id="bmiHint"></div>
      <div class="f" style="margin-top:12px"><label for="activity">筋トレ以外の活動量</label><select id="activity">${Object.keys(PAL).map(k => `<option value="${k}" ${p.activity === k ? 'selected' : ''}>${PAL_LABEL[k]}</option>`).join('')}</select></div>
      <div class="f"><label for="exp">筋トレの経験</label><select id="exp">${Object.keys(EXP).map(k => `<option value="${k}" ${p.exp === k ? 'selected' : ''}>${EXP[k].label}</option>`).join('')}</select></div>
      <h2 style="margin-top:18px">理想の体型</h2>
      <div class="goals" id="goals"></div>
      <div id="customBox" class="f two" style="margin-top:10px">
        <div><label for="customWeight">目標体重（kg）</label><input type="number" id="customWeight" inputmode="decimal" step="0.1" min="30" max="200" value="${esc(p.customWeight || '')}"></div>
        <div><label for="customBF">目標体脂肪率（%・任意）</label><input type="number" id="customBF" inputmode="decimal" step="0.1" min="5" max="45" value="${esc(p.customBF || '')}"></div>
      </div>
      <h2 style="margin-top:18px">トレーニング環境</h2>
      <div class="f"><span class="lbl">筋トレする曜日（最大6日）</span><div class="dows">${[1, 2, 3, 4, 5, 6, 0].map(d => `<label><input type="checkbox" name="dow" value="${d}" ${p.days.includes(d) ? 'checked' : ''}><span>${DOW[d]}</span></label>`).join('')}</div><div class="hint">週3日（月・水・金など1日おき）がおすすめ。休養日は軽いウォーキングなどになります。</div></div>
      <div class="f"><span class="lbl">ダンベル</span><div class="seg">${radio('db', 'no', '持っていない（自重のみ）', p.dumbbell ? 'yes' : 'no')}${radio('db', 'yes', '持っている', p.dumbbell ? 'yes' : 'no')}</div></div>
      <div class="f" id="dbBox"><label for="dbMax">ダンベルの最大重量（片手・kg）</label><input type="number" id="dbMax" inputmode="decimal" step="0.5" min="1" max="60" value="${esc(p.dbMax || 10)}"><div class="hint">重さを変えられる可変式ダンベルなら、その最大値を入れてください。</div></div>
      <div class="f"><label for="start">開始日</label><input type="date" id="start" value="${esc(p.start)}"></div>
      <h2 style="margin-top:18px">食事の好み</h2>
      <div class="f"><span class="lbl">食事のスタイル</span><div class="seg">${Object.keys(MEAL_STYLE).map(k => radio('meal', k, MEAL_STYLE[k], p.meal || 'mix')).join('')}</div><div class="hint">自炊中心なら定食・パスタなど、コンビニ中心ならおにぎり・サラダチキンなどで食事の例を作ります。</div></div>
      <div class="f"><span class="lbl">食べられないもの（アレルギー・苦手）</span><div class="dows ng">${Object.keys(NG).map(k => `<label><input type="checkbox" name="ng" value="${k}" ${(p.ng || []).includes(k) ? 'checked' : ''}><span>${NG[k]}</span></label>`).join('')}</div><div class="hint">選んだ食品は食事の例に出てきません。重いアレルギーがある場合は、原材料を必ず自分で確認してください。</div></div>
      <div class="f"><span class="lbl">プロテイン</span><div class="seg">${radio('pro', 'no', '使わない', p.protein ? 'yes' : 'no')}${radio('pro', 'yes', '使う', p.protein ? 'yes' : 'no')}</div></div>
      <div class="err" id="perr" role="alert"></div>
      <button class="btn" type="submit">${S.p ? 'この内容でプランを作り直す' : 'プランを作成'}</button>
    </form>
    ${S.p ? `<div class="card"><button class="btn danger" id="reset">すべてのデータを消去</button><p class="tiny" style="margin:6px 0 0">プロフィール・完了チェック・体重の記録を、この端末から消します。</p></div>` : ''}`;
  const f = $('#pf');
  const sexNow = () => f.querySelector('input[name=sex]:checked').value;
  let goalSel = p.goal;
  const drawGoals = () => {
    const sx = sexNow();
    $('#goals').innerHTML = Object.keys(GOALS).map(k => `<label class="goal"><input type="radio" name="goal" value="${k}" ${goalSel === k ? 'checked' : ''}><b>${GOALS[k][sx].name}</b><span>${GOALS[k][sx].desc}</span></label>`).join('');
    $('#customBox').style.display = goalSel === 'custom' ? '' : 'none';
  };
  const drawDb = () => { $('#dbBox').style.display = f.querySelector('input[name=db]:checked').value === 'yes' ? '' : 'none'; };
  const drawBmi = () => {
    const h = +$('#height').value, w = +$('#weight').value, a = +$('#age').value, bf = +$('#bodyFat').value;
    if (h >= 120 && w >= 30) {
      const tmp = { sex: sexNow(), height: h, weight: w, age: a || 30, bodyFat: bf };
      $('#bmiHint').textContent = `BMI ${r1(w / h2of(tmp))}${bf > 0 ? '' : ` ・ 推定体脂肪率 約${r1(estBF(tmp))}%`}${a ? ` ・ 基礎代謝 約${num(bmrOf(tmp, w))}kcal/日` : ''}`;
    } else $('#bmiHint').textContent = '';
  };
  drawGoals(); drawDb(); drawBmi();
  f.addEventListener('change', e => {
    if (e.target.name === 'sex') { drawGoals(); drawBmi(); }
    if (e.target.name === 'goal') { goalSel = e.target.value; $('#customBox').style.display = goalSel === 'custom' ? '' : 'none'; }
    if (e.target.name === 'db') drawDb();
    if (e.target.name === 'dow') {
      const on = $$('input[name=dow]:checked', f);
      if (on.length > 6) { e.target.checked = false; $('#perr').textContent = '週に1日は休養日を入れてください（最大6日）。'; } else $('#perr').textContent = '';
    }
  });
  f.addEventListener('input', drawBmi);
  f.addEventListener('submit', e => {
    e.preventDefault();
    const v = id => $('#' + id).value.trim();
    const np = {
      sex: sexNow(), age: +v('age'), height: +v('height'), weight: +v('weight'), bodyFat: v('bodyFat') ? +v('bodyFat') : null,
      activity: v('activity'), exp: v('exp'), goal: goalSel, customWeight: v('customWeight') ? +v('customWeight') : null, customBF: v('customBF') ? +v('customBF') : null,
      days: $$('input[name=dow]:checked', f).map(i => +i.value), dumbbell: f.querySelector('input[name=db]:checked').value === 'yes', dbMax: +v('dbMax') || 10, start: v('start') || ymd(todayDate()),
      meal: f.querySelector('input[name=meal]:checked').value, ng: $$('input[name=ng]:checked', f).map(i => i.value), protein: f.querySelector('input[name=pro]:checked').value === 'yes'
    };
    const errs = [];
    if (!(np.age >= 13 && np.age <= 90)) errs.push('年齢は13〜90で入力してください。');
    if (!(np.height >= 120 && np.height <= 220)) errs.push('身長は120〜220cmで入力してください。');
    if (!(np.weight >= 30 && np.weight <= 200)) errs.push('体重は30〜200kgで入力してください。');
    if (np.bodyFat != null && !(np.bodyFat >= 3 && np.bodyFat <= 60)) errs.push('体脂肪率は3〜60%で入力してください（わからなければ空欄）。');
    if (np.goal === 'custom' && !(np.customWeight >= 30 && np.customWeight <= 200)) errs.push('目標体重を30〜200kgで入力してください。');
    if (np.goal === 'custom' && np.customBF != null && !(np.customBF >= 5 && np.customBF <= 45)) errs.push('目標体脂肪率は5〜45%で入力してください。');
    if (!np.days.length) errs.push('筋トレする曜日を1日以上選んでください。');
    if (np.dumbbell && !(np.dbMax >= 1 && np.dbMax <= 60)) errs.push('ダンベルの最大重量は1〜60kgで入力してください。');
    if (errs.length) { $('#perr').textContent = errs.join(' '); return; }
    S.p = np; LS.set(K_PROFILE, np);
    rebuild(); S.week = weekOfToday().wi;
    show('plan');
    window.scrollTo(0, 0);
  });
  const rs = $('#reset');
  if (rs) rs.addEventListener('click', () => {
    if (!confirm('プロフィール・完了チェック・体重の記録をすべて消去します。よろしいですか？')) return;
    [K_PROFILE, K_DONE, K_WEIGHT].forEach(k => localStorage.removeItem(k));
    S.p = null; S.sim = null; show('setup');
  });
}

/* ---------- app shell ---------- */
function rebuild() { S.sim = simulate(S.p); }
function show(v) {
  if (!S.p) v = 'setup';
  S.view = v;
  document.body.classList.toggle('no-nav', !S.p);
  $$('.view').forEach(s => s.classList.toggle('on', s.id === 'v-' + v));
  $$('nav.tabs button').forEach(b => { b.removeAttribute('aria-current'); if (b.dataset.v === v) b.setAttribute('aria-current', 'page'); });
  $('#sub').textContent = S.p ? `${GOALS[S.p.goal][S.p.sex].name}を目指すプラン` : '理想体型プランナー';
  ({ today: renderToday, week: renderWeek, plan: renderPlan, setup: renderSetup })[v]();
}
document.addEventListener('change', e => {
  const k = e.target.dataset && e.target.dataset.k;
  if (!k) return;
  const done = LS.get(K_DONE, {});
  if (e.target.checked) done[k] = 1; else delete done[k];
  LS.set(K_DONE, done);
  const li = e.target.closest('li'); if (li) li.classList.toggle('is-done', e.target.checked);
  // 見出しの完了数を更新するため描き直す（開閉状態とスクロール位置は保つ）
  rerender();
});
function rerender() {
  if (S.view !== 'week' && S.view !== 'today') return;
  const root = $('#v-' + S.view), open = $$('details', root).map(d => d.open), y = window.scrollY;
  (S.view === 'week' ? renderWeek : renderToday)();
  $$('details', root).forEach((d, i) => { if (i < open.length) d.open = open[i]; });
  window.scrollTo(0, y);
}
document.addEventListener('click', e => {
  const t = e.target.closest('button');
  if (!t) return;
  if (t.dataset.v) { if (t.dataset.v === 'week' && S.sim) S.week = weekOfToday().wi; show(t.dataset.v); window.scrollTo(0, 0); return; }
  if (t.dataset.reroll) {
    const seeds = LS.get(K_MSEED, {}), k = t.dataset.reroll;
    seeds[k] = (seeds[k] || 0) + 1; LS.set(K_MSEED, seeds);
    rerender();
    return;
  }
  if (t.id === 'wPrev') { S.week--; renderWeek(); }
  else if (t.id === 'wNext') { S.week++; renderWeek(); }
  else if (t.id === 'wSave') {
    const v = +$('#wIn').value;
    if (!(v >= 20 && v <= 250)) { $('#wIn').focus(); return; }
    const logs = LS.get(K_WEIGHT, {}); logs[ymd(todayDate())] = Math.round(v * 10) / 10; LS.set(K_WEIGHT, logs);
    renderToday();
  } else if (t.id === 'replan') {
    const logs = LS.get(K_WEIGHT, {}), kg = logs[ymd(todayDate())];
    if (kg == null) return;
    // 予測の除脂肪量はそのままにして、ずれた分を体脂肪として扱う
    const { wi, di } = weekOfToday(), w = S.sim.weeks[wi];
    const Lnow = w.L + (w.dL * di / 7);
    S.p = Object.assign({}, S.p, { weight: kg, bodyFat: Math.round(clamp((1 - Lnow / kg) * 100, 4, 58) * 10) / 10, start: ymd(todayDate()) });
    LS.set(K_PROFILE, S.p); rebuild(); S.week = 0; show('today'); window.scrollTo(0, 0);
  }
});
document.addEventListener('change', e => { if (e.target.id === 'wSel') { S.week = +e.target.value; renderWeek(); } });
let rT; window.addEventListener('resize', () => { clearTimeout(rT); rT = setTimeout(() => { if (S.view === 'plan') drawChart(); }, 150); });
document.addEventListener('visibilitychange', () => { if (!document.hidden && S.p && S.view === 'today') renderToday(); });

S.p = LS.get(K_PROFILE, null);
if (S.p) S.p = Object.assign({ meal: 'mix', ng: [], protein: false }, S.p); // 食事の好みがない古いプロフィール向け
if (S.p) { try { rebuild(); S.week = weekOfToday().wi; } catch (e) { console.error(e); S.p = null; } }
show(S.p ? 'today' : 'setup');

if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('./sw.js').catch(() => { });
(() => { // iPhoneのSafariでは「ホーム画面に追加」の案内を一度だけ出す
  const ios = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = navigator.standalone || matchMedia('(display-mode: standalone)').matches;
  if (ios && !standalone && !LS.get(K_TIP, false)) {
    $('#installTip').style.display = 'block';
    $('#installX').onclick = () => { $('#installTip').style.display = 'none'; LS.set(K_TIP, true); };
  }
})();
window.KT = { S, simulate, targetOf, bmrOf, estBF, EX, PAT, FOOD, mealPlan };
})();
