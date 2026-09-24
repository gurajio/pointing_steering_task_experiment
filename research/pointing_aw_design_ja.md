# 円周配置ポインティング：A・Wの設計と先行研究の数値抽出

追補：IDを整数にする希望に対応した[整数ID・ピクセル指定の比較案](pointing_aw_integer_id_proposal_ja.md)を追加した。以下は元のmm設計と文献抽出の記録。

調査日：2026-09-22。対象はマウスによるクリック選択。今回選択された多方向タッピング課題について、27インチモニターで使う初期条件を設計した。実験アプリの実装・実測はまだ行っていない。

**提案は、中心間距離 A＝90・180 mm、円形ターゲットの直径 W＝10・20 mmを交差させた4条件。中立的な教示で、全条件を同じ回数実施したときの平均MT約750〜800 msを設計目標とする。** 342名の多方向ポインティング研究の回帰式を適用すると、4条件平均は約772 msになる。これは文献モデルによる予測であり、この装置・参加者での実測値ではない。

ここでは「本実験を始める頃のMT」を目標とする。反復に伴うMTの短縮は習熟の測定対象なので、本実験中に難易度を変更してMTを一定に保つ操作は行わない。参加者が成人の通常のマウス利用者であることを想定した初期案である。

## 1. 何を根拠に設計したか

16件の原著・著者公開稿から、A、W、マウスMT、課題形状、画面、反復を確認できる範囲で抽出した。27インチには限定していない。全世界の文献を網羅した系統的レビューや、研究間の統合平均を推定するメタ分析ではない。検索では mouse / pointing / Fitts / movement time / amplitude / target width / multidirectional / learning を組み合わせ、関連論文の引用文献も参照した。非マウス装置との比較論文からはマウス条件を取り出した。

主な根拠は、同じ多方向課題で中立教示の回帰式を示した[S1]。27インチ相当かつ8日間の反復を含む[S2]、27インチと明記された[S3]を環境・習熟の比較資料とした。原著の平均MTを寄せ集めて「マウスの標準MT」を作ることはしていない。ID範囲、年齢、教示、練習量、ミス後の処理、計時区間が違うためである。

最頻値は、試行別データと、ヒストグラムの階級幅または密度推定方法が必要になる。多くの論文で直接比較できるのは平均MTなので、**今回は平均を設計基準とした**。論文間の平均値の最頻値も、個々のポインティング試行の最頻値にはならない。

## 2. 推奨する4条件

Shannon形式を用いる。

`ID = log2(A / W + 1)`

| 条件 | A：中心間距離 (mm) | W：円の直径 (mm) | A/W | ID (bit) | [S1]による予測平均MT (ms) |
|---|---:|---:|---:|---:|---:|
| C1：短距離・大ターゲット | 90 | 20 | 4.5 | 2.459 | 614 |
| C2：短距離・小ターゲット | 90 | 10 | 9 | 3.322 | 769 |
| C3：長距離・大ターゲット | 180 | 20 | 9 | 3.322 | 769 |
| C4：長距離・小ターゲット | 180 | 10 | 18 | 4.248 | 936 |
| 条件を等重みで平均 | — | — | — | 3.338 | **772** |

4条件を同数実施する前提である。すべての条件を750 msに揃える意味ではなく、易しい条件と難しい条件を含めた平均を既往研究の中立条件に近づける。C2・C3は同じIDでAとWの絶対寸法が2倍なので、「同じIDでも絶対寸法や習熟曲線が違うか」を比較できる。ただし、同一IDだから実測MTまで必ず等しくなるとは仮定しない。

Aの90・180 mmは、実寸条件を示した[S2, S7]などを参考にしつつ、27インチ上で小さすぎず、画面端にも接しない範囲として選んだ。Wは後述の目標IDから決めた**本設計の値**であり、4条件一式をそのまま実施した先行研究があるという意味ではない。2×2の交差によりAとWの効果を分けて調べられる。3種類のIDなので、広いID範囲でFittsモデル自体の妥当性を精密に検証する用途には追加条件が必要になる。

### 計算の出典と手順

[S1] Figure 9(a) の中立教示・公称IDモデルは次のとおりである。

`MT [ms] = 171.5 + 180.0 × ID`（R²＝0.991308）

同研究の中立教示平均773 msに対応するIDは、`(773 − 171.5) / 180 ≈ 3.34 bit`。A/W＝9の条件はID＝log2(10)≒3.322となり、予測MTは約769 ms。AとWをそれぞれ2水準にして交差させると、平均ID≒3.338、予測MT≒772 msになる。

ここで使ったのは**公称IDに対する式**である。実験後にクリック位置から算出する有効幅We・有効IDの回帰式に、設計時の公称Wを代入したものではない。論文の平均throughputから単純にMT＝ID/TPと逆算する方法も採用していない。

### 予測の限界

[S1]はクラウド実験で、装置・感度・表示環境は統一されていない。参加者の平均年齢も45.6歳である。したがって、本設計への適用は研究間の予測の移植であり、予測誤差や信頼区間はここでは推定できない。

一方、[S2]の8回目のマウス測定では、ID＝2,3,4,5,6でMT＝370,520,670,840,1010 msだった。これらの丸められた表の5平均にこちらで直線を当てると `MT ≈ 42 + 160 × ID [ms]`。提案4条件の平均は約576 msと予測される。この値は論文掲載の回帰係数ではなく、**こちらによる再計算**である。同研究は少人数・長期練習後で、平均エラー率も約9%であるため、[S1]の中立教示と同一条件ではない。また、同論文のAmplitudeと配置半径の説明に曖昧さがある（抽出注参照）。この比較は、27インチというだけではMTが決まらないことを示すために用い、正確な下限や信頼区間とは扱わない。

## 3. A、W、配置円の定義

- A：連続して選択する2ターゲットの**中心間の直線距離**。カーソル軌跡長、円周に沿う弧長、画面中心からターゲットまでの半径とは区別する。
- W：円形ターゲットの直径。ヒット判定に使う領域の直径と一致させる。スクリーンショットの小正方形をそのまま用いる場合は、接近方向と正方形の幅の扱いを別途定義する必要があるため、本案では円形を採用する。
- D：ターゲット中心を並べる配置円の直径。Aとは別の設定値として保存する。

ターゲット数は**13個を提案**する。[S3]にも13個の実施例があり、全ターゲットを表示しても今回の4条件で重ならない。時計回りに0〜12と番号を付け、6個先へ進む順序なら、開始0から `0→6→12→5→11→4→10→3→9→2→8→1→7→0`。最初の0は開始クリック、以後の13移動を測定する。

奇数N個でこのようにほぼ反対側へ移動するとき、幾何学的に `A = D × cos(π/(2N))`。したがってN＝13では、A＝90 mmにD＝90.661 mm、A＝180 mmにD＝181.322 mmを使う。[S18]も配置直径と実移動距離の違いを論じている。

最も隣接ターゲットが近いA＝90・W＝20でも、隣接中心間距離は21.697 mm、円周上の隣同士の境界間は1.697 mm空く。最大外形はD＋W＝201.322 mm。27インチ・16:9の画面高約336.22 mmに収まる。25個を全表示する場合、この易しい条件ではターゲットが重なるため、13個のまま使うか、表示方式・条件を再設計する必要がある。

## 4. 27インチへの換算

解像度とOS倍率は未確認なので、**mmを正式な条件値**とする。下表は27インチ・16:9、表示領域全体にネイティブ画素が対応する場合の理論換算値。ベゼルを含まない表示部は約597.73×336.22 mmとなる。

| 物理量 | Full HD 1920×1080 | QHD 2560×1440 | 4K 3840×2160 |
|---|---:|---:|---:|
| 1 mm | 3.212画素 | 4.283画素 | 6.424画素 |
| A＝90 mm | 約289画素 | 約385画素 | 約578画素 |
| A＝180 mm | 約578画素 | 約771画素 | 約1156画素 |
| W＝10 mm | 約32画素 | 約43画素 | 約64画素 |
| W＝20 mm | 約64画素 | 約86画素 | 約128画素 |

これらは**物理画素**であり、そのままCSS pxとして指定できるとは限らない。OS倍率・ブラウザズーム・canvasの描画倍率に応じた補正が必要になる。実装時は画面上に100 mmの校正線を出し、定規で実寸が100 mmになるよう「CSS px/mm」を校正する。小数座標を保持してAとWを同じ校正係数で変換し、整数丸めを条件の定義に使わない。マウスDPIとモニターの画素密度も別物である。

## 5. 本実験の前に行うMTの確認

以下は本設計の提案で、文献に定められた必要人数・検出力計算ではない。

1. 本実験と同じ対象集団から、予備実験専用の5〜8名を集める。本番と同じ画面・マウス・感度・加速設定を使う。
2. 操作確認を各条件1系列、その後各条件4系列×13移動を測定する。測定は4条件で208移動/人。条件の順序を参加者間で均衡させる。
3. 条件ごと・参加者ごとの算術平均MTを求め、参加者と条件に等しい重みで全体平均を計算する。目標帯は**750〜800 msを中心とした650〜850 ms**を初期の実用的許容範囲とする。これは統計的な同等性限界ではなく、装置調整のための事前ルールである。最初の測定系列と最後の系列も別々に確認する。
4. MTに加え、初回クリックのエラー率を必ず見る。短いMTが大量のミスによるものでないかを確認する。中立教示の参考値は[S1]で3.24%だが、全員を特定のエラー率に誘導しない。
5. MTが目標から外れたら、Aを固定し、2つのWを共通倍率kで変更する。速すぎればkを小さくして難しくし、遅すぎればkを大きくする。同一ID対の関係と2×2構造は維持できる。AとWの両方を同じ倍率で変えるだけではIDは変わらない。
6. 予備データの条件平均から `MT = a + b × log2(A/W+1)` を当て、変更後4条件の平均予測が750 ms付近になるkを求める。ただしbが不安定なら追加測定する。変更後は画面への収まり・重なり・エラー率を確認し、必要に応じ別の予備参加者で再確認する。主実験の開始前に条件を固定する。

例として、Wを10/20から6/12 mmへ変えれば、同じAで平均IDは4.010となる。ただし[S1]では平均約893 ms、[S2]の再計算式では約684 msであり、**この変更が750 msを実現するという保証はない**。予備データに基づいて選ぶ。

13個全表示のままWを広げられる上限もある。A＝90 mmではW＜21.697 mmが必要なので、現行W＝20の共通倍率は約1.085未満。これを超える調整が必要なら、ターゲット数や表示方式を再検討する。

教示は「強調されたターゲットを、できるだけ速く、かつ正確にクリックしてください」など、全条件・全参加者で統一する。750 msという設計目標は参加者に伝えず、ペース音や時間制限も入れない。目標MTを伝えると測りたい速度と正確さの配分を変えてしまう。[S1, S12]は速度・正確さに関する指示やフィードバックによってMTが変わる実例である。

計時は[S1]に合わせるなら、前ターゲットの成功クリックから次ターゲットへの**初回クリック**まで。ミス時は同じターゲットを再選択させ、初回MT・初回成否と修正に要した時間を別々に保存する。開始クリック、系列間の休憩、説明時間はMTから除く。主解析のMT定義、ミス後の遷移、外れ値ルールを先に固定する。成功試行だけを残すときは、その選択が平均MTに及ぼす影響にも注意する。

## 6. 先行研究からの抽出一覧

**凡例：**「報告」＝論文本文・表・図中に数値が記載。「概算」＝図の目視読取り。「再集計」＝公開データをこちらで計算。「未抽出」＝今回数値を確認できなかったもので、論文に存在しないという断定ではない。Aは原著の表記を優先し、配置直径Dであることが分かる場合はDと記した。mm換算に必要な情報が不足するpx値は換算していない。

### 多方向課題・比較に近いもの

| ID・研究 | 対象・マウス反復 | 画面 | 原著のA・W | マウスMTと確認位置 |
|---|---|---|---|---|
| S1 Yamanaka & MacKenzie (2026) | 募集346、分析342名。25ターゲット。各教示6条件×25選択 | 各自のWindows環境、解像度1280×850以上。アプリ1200×800 | A＝320,500 px × W＝20,45,100 px | **中立773 ms**、正確さ重視864、速さ重視720。§5.2・Fig.6。報告 |
| S2 Bérard (2024) | 6名。11ターゲット。8日、各日440選択/入力方式＋ウォームアップ | 597×336 mm、2560×1440、165 Hz。実寸から約27インチ | (A,W)＝(36,12),(63,9),(90,6),(124,4),(189,3) mm | **最終日平均680 ms**。ID別370/520/670/840/1010 ms。Tables 1,3。報告 |
| S3 Ramcharitar & Teather (2017) | 5名。13ターゲット。6条件×13×5ブロック＝390選択/装置 | **27インチLGテレビ**。解像度は未確認 | A＝128,256,512 px × W＝20,35 px | **約0.75〜0.80 s**。Fig.8のマウス棒、目視概算。TP4.73からの逆算ではない |
| S4 MacKenzie, Kauppinen & Silfverberg (2001) | 12名。16ターゲット、15選択×5系列×10ブロック | 17インチ、Windows 98。Logitech FirstMouse+ | 配置D＝400 px（約180 mm）、W＝30 px（約13 mm） | MTはFig.7。今回数値未抽出。TP4.9 bpsをMTと混同しない |
| S5 Wobbrock, Shinohara & Jansen (2011) | 21名。1D・2D両方。各18条件、練習3＋測定20試行 | 21インチ、1600×1200。Logitech光学式 | A＝256,384,512 px × W＝8,16,32,64,96,128 px | 全体平均MTは未抽出。Table 1の係数には有効ID・絶対値の切片が含まれ、今回の予測に使わない |
| S6 Rajanna & Hammond (2022、arXiv公開稿) | 12名。13ターゲット、4条件×4ブロック＝208選択/入力方式 | 24インチ。解像度は未確認 | A＝1000,1100 px × W＝230,330 px | **683.9 ms、SD148.5 ms**。Table 2。報告。査読済論文としては数えない |
| S7 Seixas, Cardoso & Dias (2015) | 募集12名。公開分析では未完了2名を除く10名。16ターゲット、15×5×8＝600選択/装置 | HP L1706、1280×1024。Genius Xscroll、OS X | 配置D＝180 mm、W＝13 mm | 公開データ再集計：全8ブロック**880.4 ms**、論文主要分析と同じ4〜8ブロック**867.7 ms**。Fig.5・公開Rスクリプト |
| S16 Sanchez et al. (2021) | 6〜8歳10名。多方向、4条件。3日訓練前後 | 17インチノート。解像度は未確認 | A＝256,512 px × W＝32,96 px | **1014.25→973.90 ms**。§3/Fig.4。報告。児童なので成人の設計基準から除外 |

### 水平反復・その他のマウス基準条件

| ID・研究 | 形状・対象 | 画面 | 原著のA・W | マウスMTと確認位置 |
|---|---|---|---|---|
| S8 Bachmann, Weichert & Rinkenauer (2015) | 水平2ターゲット、12名。3ブロック、各条件20選択 | 22インチ、**1680×1280と原文記載**。Logitech RX250 | A＝40,80,160 mm × W＝10,20,40 mm、9組・5 ID | **565 ms**。§3.1.2。報告。別入力装置との総平均757 msは使わない |
| S9 MacKenzie & Jusoh (2001) | 水平反復、12名、4ブロック | 15インチVGA、Microsoft Mouse 2.0 | A＝40,80,160 mm × W＝10,20,40 mm | **666 ms**。§5.1。報告。GyroPoint-deskの598 msとは別 |
| S10 MacKenzie, Sellen & Buxton (1991) | 水平の選択課題、12名、5セッション | Macintosh II。寸法・解像度は未確認 | A＝64,128,256,512 px × W＝8,16,32,64 px | **674 ms**。Results—Movement Time。報告。draggingの916 msとは別 |
| S11 Akamatsu & MacKenzie (1996) | 左下から右上56°の離散選択、12名 | NEC PC9801、特製マウス。寸法・解像度は未確認 | A＝72,144,288 px × W＝11,21,41 px（正方形） | **通常フィードバック520 ms**。Table 1/§5.1。報告。全フィードバック平均503 msとは別 |
| S12 MacKenzie & Isokoski (2008) | 水平反復、18名。3種類の教示 | Microsoft IntelliMouse USB。画面条件は未確認 | A＝400 px、W＝25 px | **標準756 ms**、速さ重視613、正確さ重視947。Results/Fig.4。報告 |
| S13 Sasangohar, MacKenzie & Scott (2009) | 水平反復、12名 | 32インチ卓上投影、800×600。Logitech MX110 | A＝64,128,256,512 px × W＝8,16,32,64 px | **条件別ブロック平均の範囲607〜1323 ms**。Abstract/Results。全条件平均ではない |
| S14 Casiez et al. (2008), Exp.1 | 水平反復、8名。ゲイン・加速を操作 | 20インチ、1600×1200、100 DPI。Logitech MX518・1600 DPI | A＝90,180,360 mm × W＝2,4,8 mmから(180,4)を除く8組 | 選択したゲイン水準の集計：固定ゲイン**1200 ms**、加速**1160 ms**。§4.3付近。全設定平均ではない |
| S15 Isokoski & Raisamo (2002) | 水平矩形、12名、6種類のマウス、2日 | 21インチ、1600×1200、85 Hz | A＝16〜1024 px（2倍刻み）、W＝4〜512 px（2倍刻み）、W≤A/2の35組 | 6機種の平均：**761,811,786,816,768,767 ms**。Fig.6に数値記載。6件の独立研究とは扱わない |

### 直接比較する際の抽出注

- **S1：** ソフトウェアの更新設定250 Hzは、モニターのリフレッシュレートが全員250 Hzという意味ではない。中立教示では初回エラー率3.24%。Fig.6の各A/W平均は別CSVに転記した。
- **S2：** 27インチは原文の実寸から算出した値。Table 1のAmplitudeを上表に転記したが、本文には配置円のradiusをAmplitudeとする記述がある。表のIDはlog2(A/W+1)に一致する一方、半径として解釈すると実移動距離が異なるため、配置幾何をそのまま再現する根拠にはしない。最終日のMTを初回のMTと扱わない。
- **S3：** テレビ・ソファの実験環境であり、27インチという寸法だけで一般の机上実験と同等とはいえない。「中心に近くクリックする」指示、ポインタ加速OFFも比較時の条件となる。図読取りの精度を超えて760.0 msなどとは記載しない。
- **S4/S7：** 16個配置は過去の実装例。偶数配置の移動距離の違いをそのまま新実験へ持ち込まず、本案では奇数13個と厳密な中心間距離を使う。
- **S7：** 原著Fig.5には正確なMTの数値ラベルがないため、公開データDOIと著者公開スクリプトを確認した。マウスの各軌跡について重複サンプルをまとめ、ElapsedTimeを1試行のMTとし、系列平均→参加者平均→参加者間平均で算出。著者スクリプトと同じ未完了者2名の除外とブロック区分を用いた。著者自身が880.4/867.7と本文に報告したものではない。計算スクリプトとブロック平均CSVを同梱した。
- **S8：** 1680×1280は一般的な22インチ解像度から推測して1680×1050に修正していない。原著の表記として保持する。9つのA/W条件を5種類のIDにまとめた解析。
- **S11：** 移動開始からクリックまでの計時で、クリック間MTと同じではない。正方形への斜め移動でもあり、円形多方向条件の予測式としては使わない。
- **S12：** 本文のID＝4.24という記載と、A＝400・W＝25のShannon ID＝4.087が一致しない。A/Wの転記と式による再計算を区別した。また、目標時間を紙に示し、ブロック後の実績に応じて速度を調整させる手続きがある。習熟による自然なMT変化を測る本実験にはこの手続きを採用しない。
- **S14：** ミスの修正を含む成功までの時間や、ゲイン条件が関わる。異なるID範囲・計時の研究を平均して「典型的MT」を作ることは適切でない。

## 7. 出典

S1. Yamanaka, S., & MacKenzie, I. S. (2026). *Normalizing Speed-accuracy Biases in 2D Pointing Tasks with Better Calculation of Effective Target Widths.* CHI 2026, Article 1122. [著者公開本文](https://www.yorku.ca/mack/chi2026.html) · [PDF](https://www.yorku.ca/mack/chi2026.pdf) · [DOI:10.1145/3772318.3790323](https://doi.org/10.1145/3772318.3790323)

S2. Bérard, F. (2024). *Congruent Indirect Touch vs. mouse pointing performance.* International Journal of Human-Computer Studies, 187, 103261. [出版社公開本文](https://www.sciencedirect.com/science/article/am/pii/S1071581924000454) · [DOI:10.1016/j.ijhcs.2024.103261](https://doi.org/10.1016/j.ijhcs.2024.103261)

S3. Ramcharitar, A., & Teather, R. J. (2017). *A Fitts’ Law Evaluation of Video Game Controllers: Thumbstick, Touchpad and Gyrosensor.* CHI EA 2017, 2860–2866. [著者公開PDF](https://www.csit.carleton.ca/~rteather/pdfs/CHI2017_fitts_game_controllers.pdf) · [DOI:10.1145/3027063.3053213](https://doi.org/10.1145/3027063.3053213)

S4. MacKenzie, I. S., Kauppinen, T., & Silfverberg, M. (2001). *Accuracy Measures for Evaluating Computer Pointing Devices.* CHI 2001, 9–16. [著者公開本文](https://www.yorku.ca/mack/CHI01.htm) · [DOI:10.1145/365024.365028](https://doi.org/10.1145/365024.365028)

S5. Wobbrock, J. O., Shinohara, K., & Jansen, A. (2011). *The Effects of Task Dimensionality, Endpoint Deviation, Throughput Calculation, and Experiment Design on Pointing Measures and Models.* CHI 2011, 1639–1648. [著者公開PDF](https://faculty.washington.edu/wobbrock/pubs/chi-11.01.pdf) · [DOI:10.1145/1978942.1979181](https://doi.org/10.1145/1978942.1979181)

S6. Rajanna, V., & Hammond, T. (2022). *Can Gaze Beat Touch? A Fitts' Law Evaluation of Gaze, Touch, and Mouse Inputs.* arXiv:2208.01248. [公開稿](https://arxiv.org/abs/2208.01248)

S7. Seixas, M. C. B., Cardoso, J. C. S., & Dias, M. T. G. (2015). *The Leap Motion Movement for 2D Pointing Tasks — Characterisation and Comparison to Other Devices.* PECCS 2015, 15–24. [出版社PDF](https://www.scitepress.org/PublishedPapers/2015/52061/52061.pdf) · [DOI:10.5220/0005206100150024](https://doi.org/10.5220/0005206100150024) · [著者公開データ・分析スクリプト DOI:10.6084/m9.figshare.1104376](https://doi.org/10.6084/m9.figshare.1104376)

S8. Bachmann, D., Weichert, F., & Rinkenauer, G. (2015; online 2014-12-24). *Evaluation of the Leap Motion Controller as a New Contact-Free Pointing Device.* Sensors, 15(1), 214–233. [出版社本文・DOI:10.3390/s150100214](https://www.mdpi.com/1424-8220/15/1/214)

S9. MacKenzie, I. S., & Jusoh, S. (2001). *An Evaluation of Two Input Devices for Remote Pointing.* EHCI 2001, LNCS 2254, 235–249. [著者公開本文](https://www.yorku.ca/mack/ehci01.html) · [DOI:10.1007/3-540-45348-2_21](https://doi.org/10.1007/3-540-45348-2_21)

S10. MacKenzie, I. S., Sellen, A., & Buxton, W. (1991). *A Comparison of Input Devices in Elemental Pointing and Dragging Tasks.* CHI 1991, 161–166. [著者公開本文](https://www.yorku.ca/mack/CHI91.html) · [DOI:10.1145/108844.108868](https://doi.org/10.1145/108844.108868)

S11. Akamatsu, M., & MacKenzie, I. S. (1996). *Movement Characteristics Using a Mouse With Tactile and Force Feedback.* International Journal of Human-Computer Studies, 45, 483–493. [著者公開本文](https://www.yorku.ca/mack/IJHCS2.html) · [DOI:10.1006/ijhc.1996.0063](https://doi.org/10.1006/ijhc.1996.0063)

S12. MacKenzie, I. S., & Isokoski, P. (2008). *Fitts' Throughput and the Speed-Accuracy Tradeoff.* CHI 2008, 1633–1636. [著者公開本文](https://www.yorku.ca/mack/chi2008a.html) · [DOI:10.1145/1357054.1357308](https://doi.org/10.1145/1357054.1357308)

S13. Sasangohar, F., MacKenzie, I. S., & Scott, S. D. (2009). *Evaluation of Mouse and Touch Input for a Tabletop Display Using Fitts' Reciprocal Tapping Task.* HFES 53, 839–843. [著者公開PDF](https://www.yorku.ca/mack/hfes2009.pdf) · [DOI:10.1177/154193120905301216](https://doi.org/10.1177/154193120905301216)

S14. Casiez, G., Vogel, D., Balakrishnan, R., & Cockburn, A. (2008). *The Impact of Control–Display Gain on User Performance in Pointing Tasks.* Human–Computer Interaction, 23(3), 215–250. [著者公開PDF](https://www.dgp.toronto.edu/~ravin/papers/hci2008_cdgain.pdf) · [DOI:10.1080/07370020802278163](https://doi.org/10.1080/07370020802278163)

S15. Isokoski, P., & Raisamo, R. (2002). *Speed-accuracy Measures in a Population of Six Mice.* APCHI 2002, 765–777. [著者掲載の全文](https://www.researchgate.net/publication/233810369_Speed-accuracy_measures_in_a_population_of_six_mice) · [大学の書誌情報](https://researchportal.tuni.fi/fi/publications/speed-accuracy-measures-in-a-population-of-six-mice/)

S16. Sanchez, C., Costa, V., Garcia-Carmona, R., Urendes, E., Tejedor, J., & Raya, R. (2021). *Evaluation of Child–Computer Interaction Using Fitts’ Law: A Comparison between a Standard Computer Mouse and a Head Mouse.* Sensors, 21(11), 3826. [公開本文](https://pmc.ncbi.nlm.nih.gov/articles/PMC8197934/) · [DOI:10.3390/s21113826](https://doi.org/10.3390/s21113826)

方法論の補助資料：

S17. Soukoreff, R. W., & MacKenzie, I. S. (2004). *Towards a Standard for Pointing Device Evaluation, Perspectives on 27 Years of Fitts’ Law Research in HCI.* International Journal of Human-Computer Studies, 61, 751–789. [著者公開本文](https://www.yorku.ca/mack/ijhcs2004.html)

S18. Roig-Maimó, M. F., Mas-Sansó, R., & MacKenzie, I. S. (2026). *Design of 2D Fitts' Law Experiments: An Odd Thing About Targets.* Applied Ergonomics, 131, 104680. [著者公開本文](https://www.yorku.ca/mack/ae2026.html) · [DOI:10.1016/j.apergo.2025.104680](https://doi.org/10.1016/j.apergo.2025.104680)
