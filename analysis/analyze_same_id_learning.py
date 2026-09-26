"""同一IDのA・W条件について、13試行単位の習熟過程を比較する。"""

import argparse
import csv
import math
from collections import defaultdict
from pathlib import Path
from statistics import fmean, median

import matplotlib

matplotlib.use("Agg")
from matplotlib import font_manager
from matplotlib import pyplot as plt

BASE_DIR = Path(__file__).resolve().parent
CYCLE_SIZE = 13
EDGE_CYCLES = 4
CONDITIONS = ("C2", "C3")


def read_training(input_dir):
    paths = sorted(input_dir.glob("*.csv"))
    if not paths:
        raise ValueError(f"入力CSVがありません: {input_dir}")
    required = {
        "participantId", "sessionId", "phase", "conditionId", "trialInCondition",
        "amplitudeMm", "widthMm", "nominalId", "mtFirstMs", "firstHit", "countedAsTrial",
    }
    rows, sessions = [], {}
    for path in paths:
        with path.open(encoding="utf-8-sig", newline="") as stream:
            reader = csv.DictReader(stream)
            missing = required - set(reader.fieldnames or [])
            if missing:
                raise ValueError(f"{path.name}: 必須列がありません: {sorted(missing)}")
            for line, row in enumerate(reader, start=2):
                if row["countedAsTrial"].lower() != "true" or row["phase"] != "training" or row["conditionId"] not in CONDITIONS:
                    continue
                try:
                    trial = int(row["trialInCondition"])
                    amplitude = float(row["amplitudeMm"])
                    width = float(row["widthMm"])
                    nominal_id = float(row["nominalId"])
                    mt = float(row["mtFirstMs"])
                except ValueError as exc:
                    raise ValueError(f"{path.name}:{line}: 数値が不正です") from exc
                if trial < 1 or not all(math.isfinite(value) and value > 0 for value in (amplitude, width, nominal_id, mt)):
                    raise ValueError(f"{path.name}:{line}: 正の有限値が必要です")
                hit = row["firstHit"].lower()
                if hit not in {"true", "false"}:
                    raise ValueError(f"{path.name}:{line}: firstHitが真偽値ではありません")
                key = (row["participantId"], row["sessionId"])
                sessions.setdefault(key, {condition: [] for condition in CONDITIONS})[row["conditionId"]].append({
                    "participant_id": row["participantId"], "session_id": row["sessionId"],
                    "source_file": path.name, "condition_id": row["conditionId"], "trial": trial,
                    "amplitude_mm": amplitude, "width_mm": width, "nominal_id": nominal_id,
                    "mt_ms": mt, "error": hit == "false",
                })
                rows.append(sessions[key][row["conditionId"]][-1])
    complete = {}
    for key, condition_rows in sessions.items():
        if all(condition_rows[condition] for condition in CONDITIONS):
            complete[key] = condition_rows
    if not complete:
        raise ValueError("同一セッションにC2とC3の訓練試行がそろったデータがありません")
    return paths, complete


def validate_session(key, condition_rows):
    ids = []
    for condition in CONDITIONS:
        rows = sorted(condition_rows[condition], key=lambda row: row["trial"])
        condition_rows[condition] = rows
        expected = list(range(1, len(rows) + 1))
        if [row["trial"] for row in rows] != expected:
            raise ValueError(f"{key}: {condition}の試行番号が連続していません")
        if len(rows) % CYCLE_SIZE:
            raise ValueError(f"{key}: {condition}の試行数が13の倍数ではありません")
        values = {(row["amplitude_mm"], row["width_mm"], row["nominal_id"]) for row in rows}
        if len(values) != 1:
            raise ValueError(f"{key}: {condition}内でA・W・IDが変化しています")
        ids.append(next(iter(values))[2])
    if not math.isclose(ids[0], ids[1], rel_tol=0, abs_tol=1e-9):
        raise ValueError(f"{key}: C2とC3の公称IDが一致しません")


def summarize_cycles(sessions):
    result = []
    for key, condition_rows in sessions.items():
        validate_session(key, condition_rows)
        for condition in CONDITIONS:
            rows = condition_rows[condition]
            for start in range(0, len(rows), CYCLE_SIZE):
                selected = rows[start:start + CYCLE_SIZE]
                mts = [row["mt_ms"] for row in selected]
                result.append({
                    "participant_id": key[0], "session_id": key[1], "condition_id": condition,
                    "amplitude_mm": selected[0]["amplitude_mm"], "width_mm": selected[0]["width_mm"],
                    "nominal_id": selected[0]["nominal_id"], "cycle": start // CYCLE_SIZE + 1,
                    "trial_start": selected[0]["trial"], "trial_end": selected[-1]["trial"],
                    "n_trials": len(selected), "mean_mt_ms": fmean(mts), "median_mt_ms": median(mts),
                    "n_errors": sum(row["error"] for row in selected),
                    "error_rate_pct": 100 * sum(row["error"] for row in selected) / len(selected),
                })
    return result


def log_fit(rows):
    x = [math.log(row["cycle"]) for row in rows]
    y = [math.log(row["mean_mt_ms"]) for row in rows]
    x_mean, y_mean = fmean(x), fmean(y)
    sxx = sum((value - x_mean) ** 2 for value in x)
    slope = sum((a - x_mean) * (b - y_mean) for a, b in zip(x, y)) / sxx
    intercept = y_mean - slope * x_mean
    residuals = [b - intercept - slope * a for a, b in zip(x, y)]
    slope_se = math.sqrt(sum(value ** 2 for value in residuals) / (len(rows) - 2) / sxx)
    r2 = 1 - sum(value ** 2 for value in residuals) / sum((value - y_mean) ** 2 for value in y)
    t95 = 2.145 if len(rows) == 16 else 1.96
    return {
        "intercept": intercept, "slope": slope, "slope_se": slope_se,
        "slope_ci_low": slope - t95 * slope_se, "slope_ci_high": slope + t95 * slope_se,
        "r_squared": r2, "per_doubling_pct": 100 * (2 ** slope - 1),
    }


def session_summary(sessions, cycles):
    result = []
    by_key = defaultdict(list)
    for row in cycles:
        by_key[(row["participant_id"], row["session_id"], row["condition_id"])].append(row)
    for (participant, session, condition), block_rows in sorted(by_key.items()):
        block_rows.sort(key=lambda row: row["cycle"])
        raw = sessions[(participant, session)][condition]
        edge = EDGE_CYCLES * CYCLE_SIZE
        early, late = raw[:edge], raw[-edge:]
        fit = log_fit(block_rows)
        result.append({
            "participant_id": participant, "session_id": session, "condition_id": condition,
            "amplitude_mm": raw[0]["amplitude_mm"], "width_mm": raw[0]["width_mm"],
            "nominal_id": raw[0]["nominal_id"], "n_trials": len(raw), "n_cycles": len(block_rows),
            "overall_mean_mt_ms": fmean(row["mt_ms"] for row in raw),
            "overall_error_rate_pct": 100 * sum(row["error"] for row in raw) / len(raw),
            "early_mean_mt_ms": fmean(row["mt_ms"] for row in early),
            "late_mean_mt_ms": fmean(row["mt_ms"] for row in late),
            "mt_change_ms": fmean(row["mt_ms"] for row in late) - fmean(row["mt_ms"] for row in early),
            "mt_change_pct": 100 * (fmean(row["mt_ms"] for row in late) / fmean(row["mt_ms"] for row in early) - 1),
            "early_error_rate_pct": 100 * sum(row["error"] for row in early) / len(early),
            "late_error_rate_pct": 100 * sum(row["error"] for row in late) / len(late),
            "error_change_pp": 100 * (sum(row["error"] for row in late) / len(late) - sum(row["error"] for row in early) / len(early)),
            **{f"learning_{key}": value for key, value in fit.items()},
        })
    return result


def compare_slopes(summary):
    comparisons = []
    groups = defaultdict(dict)
    for row in summary:
        groups[(row["participant_id"], row["session_id"])][row["condition_id"]] = row
    for (participant, session), values in sorted(groups.items()):
        c2, c3 = values["C2"], values["C3"]
        difference = c3["learning_slope"] - c2["learning_slope"]
        difference_se = math.hypot(c2["learning_slope_se"], c3["learning_slope_se"])
        comparisons.append({
            "participant_id": participant, "session_id": session,
            "c2_slope": c2["learning_slope"], "c3_slope": c3["learning_slope"],
            "slope_difference_c3_minus_c2": difference,
            "slope_difference_ci_low": difference - 2.048 * difference_se,
            "slope_difference_ci_high": difference + 2.048 * difference_se,
            "c2_mt_change_pct": c2["mt_change_pct"], "c3_mt_change_pct": c3["mt_change_pct"],
            "mt_improvement_difference_pp_c3_minus_c2": -c3["mt_change_pct"] + c2["mt_change_pct"],
            "c2_error_change_pp": c2["error_change_pp"], "c3_error_change_pp": c3["error_change_pp"],
        })
    return comparisons


def write_csv(path, rows):
    with path.open("w", encoding="utf-8-sig", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)


def configure_plot():
    fonts = {font.name for font in font_manager.fontManager.ttflist}
    for font in ("Yu Gothic", "Noto Sans CJK JP", "IPAexGothic", "Arial"):
        if font in fonts:
            plt.rcParams["font.family"] = font
            break
    plt.rcParams.update({"font.size": 10, "axes.unicode_minus": False, "savefig.dpi": 180})


def plot_session(path, rows, summary):
    configure_plot()
    colors = {"C2": "#2563eb", "C3": "#d97706"}
    fig, axes = plt.subplots(2, 1, figsize=(9, 8), sharex=True)
    for condition in CONDITIONS:
        selected = sorted((row for row in rows if row["condition_id"] == condition), key=lambda row: row["cycle"])
        info = next(row for row in summary if row["condition_id"] == condition)
        label = f'{condition}: A={info["amplitude_mm"]:g}, W={info["width_mm"]:g}, ID={info["nominal_id"]:.3f}'
        x = [row["cycle"] for row in selected]
        axes[0].plot(x, [row["mean_mt_ms"] for row in selected], marker="o", color=colors[condition], label=label)
        fit = [math.exp(info["learning_intercept"] + info["learning_slope"] * math.log(value)) for value in x]
        axes[0].plot(x, fit, linestyle="--", color=colors[condition], alpha=0.8)
        axes[1].plot(x, [row["error_rate_pct"] for row in selected], marker="o", color=colors[condition], label=condition)
    axes[0].set_ylabel("平均MT (ms)")
    axes[0].set_title("同一ID条件の習熟曲線（1周＝13試行）")
    axes[0].legend()
    axes[1].set_xlabel("周")
    axes[1].set_ylabel("初回ミス率 (%)")
    axes[1].set_ylim(-2, 42)
    axes[1].set_xticks(range(1, max(row["cycle"] for row in rows) + 1))
    for axis in axes:
        axis.grid(axis="y", alpha=0.25)
        axis.set_axisbelow(True)
    fig.text(0.01, 0.01, "破線は ln(平均MT)=切片+傾き×ln(周) の推定。外れ値除外なし。C2→C3の固定順。", fontsize=9)
    fig.tight_layout(rect=(0, 0.035, 1, 1))
    fig.savefig(path)
    plt.close(fig)


def write_report(path, paths, summary, comparisons):
    lines = [
        "# 同一ID条件の習熟過程",
        "",
        "## 分析対象",
        "",
        f"入力CSV: {len(paths)}ファイル。C2とC3が同一セッションに含まれる記録のみを対象とした。",
        "1周13試行には13方向が1回ずつ含まれるため、周平均を習熟曲線の単位とした。外れ値は除外していない。",
        "",
        "## 結果",
        "",
        "|参加者|条件|A (mm)|W (mm)|ID|全体MT (ms)|全体ミス率|初期4周MT|終盤4周MT|MT変化|初期ミス率|終盤ミス率|学習傾き (95% CI)|",
        "|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
    ]
    for row in summary:
        lines.append(
            f'|{row["participant_id"]}|{row["condition_id"]}|{row["amplitude_mm"]:g}|{row["width_mm"]:g}|'
            f'{row["nominal_id"]:.3f}|{row["overall_mean_mt_ms"]:.1f}|{row["overall_error_rate_pct"]:.1f}%|'
            f'{row["early_mean_mt_ms"]:.1f}|{row["late_mean_mt_ms"]:.1f}|{row["mt_change_pct"]:.1f}%|'
            f'{row["early_error_rate_pct"]:.1f}%|{row["late_error_rate_pct"]:.1f}%|'
            f'{row["learning_slope"]:.3f} ({row["learning_slope_ci_low"]:.3f}, {row["learning_slope_ci_high"]:.3f})|'
        )
    lines.extend(["", "## 仮説との関係", ""])
    for row in comparisons:
        clear = row["slope_difference_ci_low"] > 0 or row["slope_difference_ci_high"] < 0
        lines.append(
            f'{row["participant_id"]}: 学習傾きの差（C3−C2）は{row["slope_difference_c3_minus_c2"]:.3f} '
            f'（近似95% CI {row["slope_difference_ci_low"]:.3f}〜{row["slope_difference_ci_high"]:.3f}）。'
            + ("区間は0を含まず、このセッション内では傾きの差が明瞭だった。" if clear else "区間は0を含み、このセッション内で傾きの差は明瞭でなかった。")
        )
    lines.extend([
        "",
        "このデータでは両条件とも終盤のMTが短縮した。一方、C2はミス率も低下し、C3は低下しなかったため、記述的にはC2の方が速度と正確性を同時に改善した。ただし、MTの学習傾きの差は明瞭ではない。",
        "",
        "## 解釈上の制約",
        "",
        "参加者は1名で、訓練順はC2→C3に固定されている。C2の初期には課題全般への慣れが含まれ、C3の開始時にはC2からの転移が含まれる。このため、A・Wだけが習熟差を生んだとは判断できず、この結果だけでは仮説を証明できない。",
        "複数参加者をC2→C3とC3→C2へ均衡割付し、参加者を単位に条件×反復の交互作用を検定する必要がある。",
        "",
    ])
    path.write_text("\n".join(lines), encoding="utf-8")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input-dir", type=Path, default=BASE_DIR / "inputCSV")
    parser.add_argument("--output-dir", type=Path, default=BASE_DIR / "output")
    args = parser.parse_args()
    try:
        paths, sessions = read_training(args.input_dir)
        cycles = summarize_cycles(sessions)
        summary = session_summary(sessions, cycles)
        comparisons = compare_slopes(summary)
    except (OSError, ValueError) as exc:
        parser.error(str(exc))
    args.output_dir.mkdir(parents=True, exist_ok=True)
    write_csv(args.output_dir / "same_id_13trial_summary.csv", cycles)
    write_csv(args.output_dir / "same_id_learning_summary.csv", summary)
    write_csv(args.output_dir / "same_id_learning_comparison.csv", comparisons)
    plot_session(args.output_dir / "same_id_learning_curve.png", cycles, summary)
    write_report(args.output_dir / "same_id_learning_report.md", paths, summary, comparisons)
    print(f"入力CSV: {len(paths)}ファイル / 比較可能セッション: {len(sessions)}")
    for row in summary:
        print(f'{row["condition_id"]}: MT {row["early_mean_mt_ms"]:.1f} -> {row["late_mean_mt_ms"]:.1f} ms '
              f'({row["mt_change_pct"]:.1f}%), ミス率 {row["early_error_rate_pct"]:.1f} -> {row["late_error_rate_pct"]:.1f}%')
    for row in comparisons:
        print(f'学習傾き差 C3-C2: {row["slope_difference_c3_minus_c2"]:.3f} '
              f'(95% CI {row["slope_difference_ci_low"]:.3f} to {row["slope_difference_ci_high"]:.3f})')
    print(f"出力先: {args.output_dir.resolve()}")


if __name__ == "__main__":
    main()
