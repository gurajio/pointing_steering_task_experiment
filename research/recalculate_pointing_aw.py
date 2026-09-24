"""Reproduce design calculations and, optionally, aggregate S7 public mouse data.

Standard library only. Run from any directory; outputs go beside the design report.
S7 source: https://doi.org/10.6084/m9.figshare.1104376
Raw ZIP: https://ndownloader.figshare.com/files/3203786
Analysis ZIP: https://ndownloader.figshare.com/files/3203789
Only numeric trajectory files are read; the questionnaire is not read or exported.
"""
import argparse
import csv
import hashlib
import io
import json
import math
import statistics
import zipfile
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def write_csv(name, rows):
    with (ROOT / name).open('w', encoding='utf-8-sig', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)


def design():
    n = 13
    width_mm = 27 * 25.4 * 16 / math.sqrt(16 ** 2 + 9 ** 2)
    height_mm = width_mm * 9 / 16
    rows = []
    for cid, a, w in [('C1', 90, 20), ('C2', 90, 10), ('C3', 180, 20), ('C4', 180, 10)]:
        difficulty = math.log2(a / w + 1)
        diameter = a / math.cos(math.pi / (2 * n))
        rows.append(dict(condition=cid, A_mm=a, W_mm=w, ID_bits=difficulty,
                         layout_diameter_mm=diameter,
                         predicted_MT_ms_S1_neutral=171.5 + 180 * difficulty,
                         sensitivity_MT_ms_S2_refit=42 + 160 * difficulty,
                         adjacent_target_gap_mm=diameter * math.sin(math.pi / n) - w,
                         A_native_pixels_QHD=a * 2560 / width_mm,
                         W_native_pixels_QHD=w * 2560 / width_mm))
    config = dict(
        status='literature_based_initial_design_requires_pilot_calibration',
        created='2026-09-22',
        task='multidirectional_point_select', target_shape='circle', target_count=n,
        amplitude_definition='straight_line_center_to_center_distance_between_successive_targets',
        width_definition='diameter_of_visible_and_clickable_circle', units='mm',
        clockwise_location_indices=[(i * 6) % n for i in range(n + 1)],
        first_click_is_start=True, measured_movements_per_sequence=n,
        weighting='equal_trials_per_condition_and_equal_weight_per_participant',
        target_MT_ms=[750, 800], pilot_practical_acceptance_ms=[650, 850],
        target_phase='beginning_of_main_experiment_after_minimal_task_familiarization',
        source_prediction=dict(source_id='S1', equation='MT_ms = 171.5 + 180.0 * log2(A/W+1)',
                               location='Figure 9(a), neutral, nominal ID',
                               url='https://www.yorku.ca/mack/chi2026.pdf'),
        MT_definition='previous_successful_click_to_first_click_for_current_target',
        error_handling_proposal='record_first_click_error_then_reaim_current_target_until_success',
        participant_instruction_ja='強調されたターゲットを、できるだけ速く、かつ正確にクリックしてください。',
        display=dict(diagonal_inch=27, aspect_ratio_assumption='16:9',
                     width_mm_estimate=width_mm, height_mm_estimate=height_mm,
                     native_resolution=None, os_scale=None,
                     calibrated_css_pixels_per_mm=None,
                     calibration='measure_a_100_mm_line_with_a_physical_ruler'),
        mouse=dict(model=None, dpi=None, sensitivity=None, acceleration=None),
        predicted_equal_condition_mean_MT_ms=statistics.mean(r['predicted_MT_ms_S1_neutral'] for r in rows),
        caveat='Literature transfer prediction, not a measured result or prediction interval.',
        conditions=rows)
    (ROOT / 'pointing_aw_design.json').write_text(json.dumps(config, ensure_ascii=False, indent=2)+'\n')
    write_csv('pointing_aw_proposed_conditions.csv', rows)
    return config['predicted_equal_condition_mean_MT_ms']


def seixas(path):
    # Published R code uses the first ElapsedTime in each complete trajectory,
    # Device=1 for mouse, excludes incomplete users 0 and 5, and calls blocks >3
    # the analysis without early learning. Never execute the downloaded R code.
    trials = {}
    with zipfile.ZipFile(path) as archive:
        for name in archive.namelist():
            if not name.endswith('.txt') or not Path(name).stem.isdigit():
                continue
            lines = io.StringIO(archive.read(name).decode('utf-8-sig'))
            header = next(lines).split()
            pos = {col: header.index(col) for col in
                   ['NumberDevice', 'UserId', 'Block', 'Sequence', 'CircleID', 'ElapsedTime']}
            for line in lines:
                values = line.split()
                if not values:
                    continue
                values = {col: int(values[idx]) for col, idx in pos.items()}
                if values['NumberDevice'] != 1 or values['UserId'] in [0, 5]:
                    continue
                key = tuple(values[col] for col in ['UserId', 'Block', 'Sequence', 'CircleID'])
                trials.setdefault(key, values['ElapsedTime'])
    sequences = defaultdict(list)
    for (user, block, seq, circle), mt in trials.items():
        sequences[(user, block, seq)].append(mt)
    participant_blocks = defaultdict(list)
    for (user, block, seq), mts in sequences.items():
        participant_blocks[(user, block)].append(statistics.mean(mts))
    blocks = defaultdict(list)
    for (user, block), mts in participant_blocks.items():
        blocks[block].append(statistics.mean(mts))
    rows = [dict(source_id='S7', block=block, participants=len(mts),
                 mouse_mean_MT_ms=statistics.mean(mts), provenance='recalculated_from_author_public_data')
            for block, mts in sorted(blocks.items())]
    write_csv('pointing_seixas2015_mouse_by_block.csv', rows)
    results = dict(source_doi='10.6084/m9.figshare.1104376',
                   raw_zip_sha256=hashlib.sha256(Path(path).read_bytes()).hexdigest(),
                   analyzed_participants=len({key[0] for key in trials}),
                   analyzed_mouse_trials=len(trials),
                   all_8_blocks_MT_ms=statistics.mean(row['mouse_mean_MT_ms'] for row in rows),
                   blocks_4_to_8_MT_ms=statistics.mean(row['mouse_mean_MT_ms'] for row in rows if row['block'] > 3),
                   method='mean trial MT per sequence, then per participant/block, then equal participant weights; complete balanced data')
    (ROOT / 'seixas_recalculation.json').write_text(json.dumps(results, indent=2)+'\n')
    return results


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--seixas-raw-zip', type=Path)
    args = parser.parse_args()
    print(json.dumps(dict(proposed_mean_MT_ms=design()), ensure_ascii=False))
    if args.seixas_raw_zip:
        print(json.dumps(seixas(args.seixas_raw_zip)))
