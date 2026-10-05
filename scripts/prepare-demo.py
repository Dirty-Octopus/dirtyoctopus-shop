"""从本地 WAV 生成网页试听及峰值。需要 ffmpeg；不归一化、不改原始文件。"""
from pathlib import Path
import array
import json
import subprocess

root = Path(__file__).resolve().parents[1]
output = root / 'public/assets/audio'
output.mkdir(parents=True, exist_ok=True)
peaks = {}
for demo, sources in [('glossy-neuro', ['GlossyNeuro_b4.wav','GlossyNeuro_after.wav']), ('additive-pads', ['additive pads off.wav','additive pads on.wav']), ('cool-arps', ['cool arps off.wav','cool arps on.wav'])]:
  peaks[demo] = {}
  for version, filename in zip(['before','after'],sources):
    source = root / filename
    subprocess.run(['ffmpeg', '-y', '-i', str(source), '-codec:a', 'libmp3lame', '-b:a', '192k', str(output / f'{demo}-{version}.mp3'), '-hide_banner', '-loglevel', 'error'], check=True)
    raw = subprocess.check_output(['ffmpeg', '-i', str(source), '-f', 'f32le', '-ac', '1', '-ar', '12000', '-', '-loglevel', 'error'])
    samples = array.array('f')
    samples.frombytes(raw)
    peaks[demo][version] = [round(max(abs(x) for x in samples[i * len(samples) // 256:(i + 1) * len(samples) // 256]), 4) for i in range(256)]
(root / 'src/demo-peaks.json').write_text(json.dumps(peaks) + '\n')
