"""ポインティングCSVの訓練と事後テストを集計する。

inputCSV内の全CSVを読み、標準出力とoutputへ結果を出す。
MTはmtFirstMs（初回ミスを含む）、エラーはfirstHit=false。
countedAsTrial=trueのみを対象とし、外れ値の除外は行わない。
10試行集計は参加者・セッション・条件ごとのtrialInConditionに基づく。
末尾の10試行未満の区間も実際の試行数を分母にして集計する。
"""

import argparse
import csv
import math
from collections import defaultdict
from pathlib import Path
from statistics import fmean

import matplotlib

matplotlib.use("Agg")
from matplotlib import font_manager
from matplotlib import pyplot as plt

BASE_DIR = Path(__file__).resolve().parent
BIN_SIZE = 10
PHASE_NAMES = {"training": "訓練", "post": "事後テスト"}
GROUP_FIELDS = ("participant_id", "session_id", "phase", "condition_id")
REQUIRED_FIELDS = {
    "participantId", "sessionId", "phase", "conditionId", "trialInCondition",
    "mtFirstMs", "firstHit", "countedAsTrial",
}


def read_trials(input_dir):
    paths = sorted(input_dir.glob("*.csv"))
    if not paths:
        raise ValueError(f"入力CSVがありません: {input_dir}")
    trials, seen = [], set()
    counts = {"input_files": len(paths), "input_rows": 0, "excluded_rows": 0}
    for path in paths:
        with path.open(encoding="utf-8-sig", newline="") as stream:
            reader = csv.DictReader(stream)
            missing = REQUIRED_FIELDS - set(reader.fieldnames or [])
            if missing:
                raise ValueError(f"{path.name}: 必須列がありません: {sorted(missing)}")
            for line, row in enumerate(reader, start=2):
                counts["input_rows"] += 1
                if row["phase"] not in PHASE_NAMES:
                    counts["excluded_rows"] += 1
                    continue
                counted = row["countedAsTrial"].strip().lower()
                if counted == "false":
                    counts["excluded_rows"] += 1
                    continue
                location = f"{path.name}:{line}"
                if counted != "true":
                    raise ValueError(f"{location}: countedAsTrialが真偽値ではありません")
                try:
                    number = int(row["trialInCondition"])
                    mt = float(row["mtFirstMs"])
                except (ValueError, TypeError) as exc:
                    raise ValueError(f"{location}: 試行番号またはMTが不正です") from exc
                hit = row["firstHit"].strip().lower()
                if number < 1 or not math.isfinite(mt) or mt <= 0:
                    raise ValueError(f"{location}: 試行番号とMTには正の値が必要です")
                if hit not in {"true", "false"}:
                    raise ValueError(f"{location}: firstHitが真偽値ではありません")
                trial = dict(zip(GROUP_FIELDS, (
                    row["participantId"], row["sessionId"], row["phase"], row["conditionId"],
                )))
                if not all(trial.values()):
                    raise ValueError(f"{location}: 参加者・セッション・条件のIDが空です")
                key = (trial["session_id"], trial["phase"], trial["condition_id"], number)
                if key in seen:
                    raise ValueError(f"{location}: 試行が重複しています: {key}")
                seen.add(key)
                trial.update(trial_number=number, mt_ms=mt, error=hit == "false")
                trials.append(trial)
    if not trials:
        raise ValueError("集計対象の訓練・事後試行がありません")
    return trials, counts


def metrics(trials):
    errors = sum(trial["error"] for trial in trials)
    return {
        "n_trials": len(trials), "n_errors": errors,
        "mean_mt_ms": fmean(trial["mt_ms"] for trial in trials),
        "error_rate_pct": 100 * errors / len(trials),
    }


def summarize_trials(trials):
    groups = defaultdict(list)
    for trial in trials:
        groups[(trial["phase"], trial["condition_id"])].append(trial)
    return [
        {"phase": phase, "condition_id": condition, **metrics(rows)}
        for (phase, condition), rows in sorted(groups.items())
    ]


def summarize_bins(trials):
    groups = defaultdict(list)
    for trial in trials:
        index = (trial["trial_number"] - 1) // BIN_SIZE
        groups[tuple(trial[field] for field in GROUP_FIELDS) + (index,)].append(trial)
    bins = []
    for key, rows in sorted(groups.items()):
        numbers = [row["trial_number"] for row in rows]
        bins.append({
            **dict(zip(GROUP_FIELDS, key[:-1])), "bin_index": key[-1] + 1,
            "trial_start": min(numbers), "trial_end": max(numbers),
            "trial_center": fmean(numbers), **metrics(rows),
        })
    return bins


def write_csv(path, rows):
    with path.open("w", encoding="utf-8-sig", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)


def configure_plots():
    fonts = {font.name for font in font_manager.fontManager.ttflist}
    for font in ("Hiragino Sans", "Yu Gothic", "Noto Sans CJK JP", "IPAexGothic"):
        if font in fonts:
            plt.rcParams["font.family"] = font
            break
    plt.rcParams.update({"font.size": 11, "axes.unicode_minus": False, "savefig.dpi": 180})


def plot_phase(phase, trials, bins, output_dir):
    conditions = sorted({trial["condition_id"] for trial in trials})
    columns = min(2, len(conditions))
    rows = math.ceil(len(conditions) / columns)
    mt_max = math.ceil(max(trial["mt_ms"] for trial in trials) / 50) * 50
    mt_edges = list(range(0, mt_max + 50, 50))
    kinds = {
        "mt_histogram": ("MTの分布", "MT (ms)", "試行数"),
        "mt_10trial_trend": ("MTの推移（10試行平均）", "条件内の試行番号（区間の中央）", "平均MT (ms)"),
        "error_10trial_trend": ("エラー率の推移（10試行単位）", "条件内の試行番号（区間の中央）", "エラー率 (%)"),
        "error_10trial_histogram": ("10試行区間ごとのエラー率の分布", "区間のエラー率 (%)", "区間数"),
    }
    for kind, (title, xlabel, ylabel) in kinds.items():
        fig, axes = plt.subplots(rows, columns, figsize=(6.4 * columns, 4.5 * rows),
                                 squeeze=False, sharex=True, sharey=True)
        for ax, condition in zip(axes.flat, conditions):
            selected = [trial for trial in trials if trial["condition_id"] == condition]
            sections = [section for section in bins if section["condition_id"] == condition]
            stats = metrics(selected)
            if kind == "mt_histogram":
                ax.hist([trial["mt_ms"] for trial in selected], bins=mt_edges,
                        color="#3b82b4", edgecolor="white")
                ax.axvline(stats["mean_mt_ms"], color="#bd4931", linestyle="--",
                           label=f'平均 {stats["mean_mt_ms"]:.1f} ms')
            elif kind == "error_10trial_histogram":
                ax.hist([section["error_rate_pct"] for section in sections],
                        bins=list(range(-5, 106, 10)), color="#d77b51", edgecolor="white")
                ax.set_xlim(-5, 105)
                ax.set_xticks(range(0, 101, 20))
            else:
                metric = "mean_mt_ms" if kind.startswith("mt_") else "error_rate_pct"
                series = defaultdict(list)
                for section in sections:
                    series[(section["participant_id"], section["session_id"])].append(section)
                for (participant, session), values in sorted(series.items()):
                    values.sort(key=lambda value: value["bin_index"])
                    label = f"参加者 {participant} / {session[:8]}"
                    ax.plot([value["trial_center"] for value in values],
                            [value[metric] for value in values], marker="o", markersize=4,
                            linewidth=1.5, label=label)
                if metric == "error_rate_pct":
                    ax.set_ylim(0, 100)
                ax.set_xlim(0, max(trial["trial_number"] for trial in trials) + 3)
            ax.set_title(f'{condition}（{stats["n_trials"]}試行・エラー {stats["error_rate_pct"]:.1f}%）')
            ax.set_xlabel(xlabel)
            ax.set_ylabel(ylabel)
            ax.grid(axis="y", alpha=0.25)
            ax.set_axisbelow(True)
            if "histogram" in kind:
                ax.yaxis.set_major_locator(matplotlib.ticker.MaxNLocator(integer=True))
            if ax.get_legend_handles_labels()[0]:
                ax.legend(fontsize=9)
        for ax in list(axes.flat)[len(conditions):]:
            ax.set_visible(False)
        fig.suptitle(f"{PHASE_NAMES[phase]}：{title}", fontsize=15)
        note = "MT＝初回クリックまでの時間（初回ミスを含む）。外れ値除外なし。"
        if kind != "mt_histogram":
            note = "条件・セッションごとに1–10、11–20…を集計。末尾の10試行未満の区間も含む。"
        if kind == "error_10trial_histogram":
            note += "\n各区間を1件として集計（試行数による重み付けなし）。"
        fig.text(0.05, 0.02, note, fontsize=9)
        fig.tight_layout(rect=(0, 0.10 if rows == 1 else 0.07, 1, 0.94))
        fig.savefig(output_dir / f"{phase}_{kind}.png")
        plt.close(fig)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input-dir", type=Path, default=BASE_DIR / "inputCSV")
    parser.add_argument("--output-dir", type=Path, default=BASE_DIR / "output")
    args = parser.parse_args()
    try:
        trials, counts = read_trials(args.input_dir)
    except (ValueError, OSError) as exc:
        parser.error(str(exc))
    summary = summarize_trials(trials)
    bins = summarize_bins(trials)
    args.output_dir.mkdir(parents=True, exist_ok=True)
    write_csv(args.output_dir / "summary.csv", summary)
    write_csv(args.output_dir / "10trial_summary.csv", bins)
    configure_plots()
    print(f'入力: {counts["input_files"]}ファイル / {counts["input_rows"]}行 / 除外 {counts["excluded_rows"]}行')
    print("MT: mtFirstMs（初回ミスを含む、外れ値除外なし）")
    print("エラー率: 初回ミス数 / countedAsTrial=trueの試行数 × 100")
    for phase, name in PHASE_NAMES.items():
        selected = [trial for trial in trials if trial["phase"] == phase]
        if not selected:
            continue
        if phase == "training":
            stats = metrics(selected)
            print(f'\n{name}全体: {stats["n_trials"]}試行 / 平均MT {stats["mean_mt_ms"]:.2f} ms / '
                  f'エラー率 {stats["error_rate_pct"]:.2f}%（{stats["n_errors"]}/{stats["n_trials"]}）')
        else:
            print(f"\n{name}（条件別）:")
        for row in summary:
            if row["phase"] == phase:
                print(f'  {row["condition_id"]}: {row["n_trials"]}試行 / 平均MT {row["mean_mt_ms"]:.2f} ms / '
                      f'エラー率 {row["error_rate_pct"]:.2f}%（{row["n_errors"]}/{row["n_trials"]}）')
        plot_phase(phase, selected, [row for row in bins if row["phase"] == phase], args.output_dir)
    print("\n10試行区切り: 1～10、11～20…（末尾は実際の試行数で集計）")
    print(f"出力先: {args.output_dir.resolve()}")


if __name__ == "__main__":
    main()
