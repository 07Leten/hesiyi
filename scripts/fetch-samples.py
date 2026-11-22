"""下载开源乐器录音，切成单音，写成 public/samples 与 banks.json。

只收录许可允许再分发的录音。洞箫没有找到逐音采样，使用 FluidR3 的尺八录音，
并在 CREDITS.md 里写明。
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import urllib.request
from pathlib import Path

import imageio_ffmpeg
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "samples"
FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
SR = 44100
PROXY = os.environ.get("https_proxy") or "http://127.0.0.1:7892"
os.environ.setdefault("http_proxy", PROXY)
os.environ.setdefault("https_proxy", PROXY)

NOTE = {
    "c": 0, "cs": 1, "db": 1, "d": 2, "ds": 3, "eb": 3, "e": 4, "f": 5,
    "fs": 6, "gb": 6, "g": 7, "gs": 8, "ab": 8, "a": 9, "as": 10, "bb": 10, "b": 11,
}


def midi_of(name: str) -> int:
    m = re.fullmatch(r"([A-Ga-g])([sb])?(-?\d)", name)
    if not m:
        raise ValueError(name)
    key = (m.group(1) + (m.group(2) or "")).lower()
    return (int(m.group(3)) + 1) * 12 + NOTE[key]


def fetch(url: str, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists() and dest.stat().st_size > 1000:
        return
    print("get", dest.name)
    req = urllib.request.Request(url, headers={"User-Agent": "hesiyi-samples"})
    try:
        with urllib.request.urlopen(req, timeout=120) as res:
            data = res.read()
    except Exception:
        # 代理证书有时拦不住 Wikimedia，改走系统网络栈
        quoted = url.replace("'", "''")
        out = str(dest).replace("'", "''")
        subprocess.run(
            ["powershell", "-NoProfile", "-Command",
             f"Invoke-WebRequest -Uri '{quoted}' -OutFile '{out}' -Proxy '{PROXY}' -UseBasicParsing"],
            check=True,
        )
        return
    dest.write_bytes(data)


def decode(path: Path) -> np.ndarray:
    proc = subprocess.run(
        [FFMPEG, "-v", "error", "-i", str(path), "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"],
        capture_output=True,
        check=True,
    )
    return np.frombuffer(proc.stdout, dtype=np.float32).copy()


def encode(samples: np.ndarray, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    peak = float(np.max(np.abs(samples))) or 1.0
    x = np.clip(samples * (0.9 / peak), -1, 1).astype(np.float32)
    subprocess.run(
        [FFMPEG, "-v", "error", "-y", "-f", "f32le", "-ar", str(SR), "-ac", "1", "-i", "pipe:0", "-b:a", "80k", str(dest)],
        input=x.tobytes(),
        check=True,
    )


def f0_at(x: np.ndarray) -> float | None:
    """谐波积谱，避免把泛音当成基频。"""
    if len(x) < SR // 20:
        return None
    x = x - float(np.mean(x))
    n = 1 << int(np.ceil(np.log2(len(x))))
    spec = np.abs(np.fft.rfft(x * np.hanning(len(x)), n=n))
    prod = spec.copy()
    for harm in (2, 3, 4):
        dec = spec[::harm]
        prod[: len(dec)] *= dec
    freqs = np.fft.rfftfreq(n, 1 / SR)
    lo, hi = int(65 * n / SR), int(1600 * n / SR)
    if hi <= lo:
        return None
    return float(freqs[lo + int(np.argmax(prod[lo:hi]))])


def midi_measured(x: np.ndarray) -> int | None:
    windows = [x[int(len(x) * a) : int(len(x) * b)] for a, b in ((0.15, 0.4), (0.4, 0.65), (0.55, 0.85))]
    pitches = [p for w in windows if (p := f0_at(w))]
    if not pitches:
        return None
    midis = [69 + 12 * np.log2(p / 440) for p in pitches]
    if max(midis) - min(midis) > 1.4:
        return None
    return int(round(float(np.median(midis))))


def fade(x: np.ndarray, inn: float = 0.006, out: float = 0.05) -> np.ndarray:
    y = x.copy()
    a, b = int(SR * inn), int(SR * out)
    if a > 1 and len(y) > a:
        y[:a] *= np.linspace(0, 1, a)
    if b > 1 and len(y) > b:
        y[-b:] *= np.linspace(1, 0, b)
    return y


def onsets(x: np.ndarray) -> list[int]:
    win = int(SR * 0.012)
    env = np.convolve(np.abs(x), np.ones(win) / win, mode="same")
    thresh = max(float(np.max(env)) * 0.22, 0.02)
    gap = int(SR * 0.16)
    found: list[int] = []
    last = -gap
    for i in range(1, len(env) - 1):
        if i - last < gap or env[i] < thresh or env[i] < env[i - 1] or env[i] < env[i + 1]:
            continue
        prev = env[max(0, i - int(SR * 0.06))]
        if env[i] > prev * 1.7:
            found.append(i)
            last = i
    return found or [int(np.argmax(env[: SR // 2]))]


def pitch_regions(path: Path, max_len: float, floor: float = 0.028) -> dict[int, np.ndarray]:
    """按音高稳定段切开。连奏的笛子、古琴不会在每个音上重新起振。"""
    x = decode(path)
    hop, win = int(SR * 0.05), int(SR * 0.28)
    frames: list[float | None] = []
    for i in range(0, max(1, len(x) - win), hop):
        seg = x[i : i + win]
        if float(np.max(np.abs(seg))) < floor:
            frames.append(None)
            continue
        f = f0_at(seg)
        frames.append(None if not f else 69 + 12 * float(np.log2(f / 440)))
    groups: list[tuple[int, int, float]] = []
    start: int | None = None
    vals: list[float] = []
    for idx, midi in enumerate(frames + [None]):
        t = idx * hop
        if midi is not None and (start is None or abs(midi - float(np.median(vals))) < 0.7):
            if start is None:
                start = t
            vals.append(midi)
            continue
        if start is not None and vals and t - start >= int(SR * 0.32):
            groups.append((start, t, float(np.median(vals))))
        start = t if midi is not None else None
        vals = [midi] if midi is not None else []
    best: dict[int, np.ndarray] = {}
    for a, b, midi_f in groups:
        midi = int(round(midi_f))
        if not (24 <= midi <= 108):
            continue
        clip = fade(x[a : min(b, a + int(SR * max_len))])
        if len(clip) < int(SR * 0.28):
            continue
        old = best.get(midi)
        if old is None or len(clip) > len(old):
            best[midi] = clip
    return best


def resample_to(clip: np.ndarray, root: int, lo: int, hi: int, step: int = 2) -> dict[int, np.ndarray]:
    """琵琶的示范基本是一个音，其余音高按弦乐的方式变速。"""
    out: dict[int, np.ndarray] = {}
    for midi in range(lo, hi + 1, step):
        rate = 2 ** ((midi - root) / 12)
        n = max(2, int(len(clip) / rate))
        y = np.interp(np.linspace(0, len(clip) - 1, n), np.arange(len(clip)), clip)
        out[midi] = fade(y[: int(SR * 2.0)])
    out[root] = clip
    return out


def slice_notes(path: Path, max_len: float) -> dict[int, np.ndarray]:
    x = decode(path)
    marks = onsets(x)
    marks.append(len(x))
    best: dict[int, np.ndarray] = {}
    for a, b in zip(marks, marks[1:]):
        b = min(b, a + int(SR * max_len))
        clip = x[a:b]
        if len(clip) < int(SR * 0.22):
            continue
        midi = midi_measured(clip)
        if midi is None or not (24 <= midi <= 108):
            continue
        clip = fade(clip)
        old = best.get(midi)
        if old is None or len(clip) > len(old):
            best[midi] = clip
    return best


def save_bank(bank: str, notes: dict[int, np.ndarray], loop: bool) -> dict:
    folder = OUT / bank
    if folder.exists():
        for old in folder.glob("*.mp3"):
            old.unlink()
    mapping: dict[str, str] = {}
    for midi, clip in sorted(notes.items()):
        name = f"{midi}.mp3"
        encode(clip, folder / name)
        mapping[str(midi)] = name
    print(f"{bank}: {len(mapping)} notes {min(notes) if notes else '-'}–{max(notes) if notes else '-'}")
    return {"base": f"samples/{bank}/", "loop": loop, "notes": mapping}


def copy_mp3(url: str, dest: Path, measured: bool = False) -> int | None:
    fetch(url, dest)
    if not measured:
        return None
    return midi_measured(decode(dest))


def main() -> None:
    raw = ROOT.parent / "sample-raw"
    raw.mkdir(parents=True, exist_ok=True)
    banks: dict[str, dict] = {}

    # 钢琴：Salamander（tonejs 已抽好的逐音 mp3，小三度一音）
    listing = json.load(urllib.request.urlopen(urllib.request.Request(
        "https://api.github.com/repos/nbrosowsky/tonejs-instruments/contents/samples/piano",
        headers={"User-Agent": "hesiyi-samples"},
    )))
    piano: dict[int, str] = {}
    for item in listing:
        if not item["name"].endswith(".mp3"):
            continue
        midi = midi_of(item["name"][:-4])
        if not (33 <= midi <= 96):
            continue
        dest = OUT / "piano" / item["name"]
        fetch(item["download_url"], dest)
        piano[midi] = item["name"]
    banks["piano"] = {"base": "samples/piano/", "loop": False, "notes": {str(k): v for k, v in sorted(piano.items())}}
    print(f"piano: {len(piano)} notes")

    # 古筝：真实古筝录音按音高切开（CC0）
    tree = json.load(urllib.request.urlopen(urllib.request.Request(
        "https://api.github.com/repos/sparklecatta-lang/XSXB-Band-Samples/git/trees/HEAD?recursive=1",
        headers={"User-Agent": "hesiyi-samples", "Accept": "application/vnd.github+json"},
    )))
    guzheng: dict[int, np.ndarray] = {}
    for blob in tree["tree"]:
        path = blob["path"]
        if not re.fullmatch(r"samples/guzheng/guzheng-(\d+)-v1-rr1\.flac", path):
            continue
        dest = raw / Path(path).name
        fetch(f"https://raw.githubusercontent.com/sparklecatta-lang/XSXB-Band-Samples/main/{path}", dest)
        clip = fade(decode(dest)[: int(SR * 3.2)])
        guzheng[int(re.search(r"-(\d+)-", path).group(1))] = clip
    banks["guzheng"] = save_bank("guzheng", guzheng, False)

    # 二胡：逐音长弓 / 短弓
    erhu_tree = json.load(urllib.request.urlopen(urllib.request.Request(
        "https://api.github.com/repos/sfzinstruments/aliexpress-erhu/git/trees/HEAD?recursive=1",
        headers={"User-Agent": "hesiyi-samples", "Accept": "application/vnd.github+json"},
    )))
    for folder, bank, art in (("sus", "erhu-long", "sus"), ("stac", "erhu-short", "stac")):
        notes: dict[int, np.ndarray] = {}
        for blob in erhu_tree["tree"]:
            path = blob["path"]
            if not re.fullmatch(rf"Samples/{folder}/erhu_[a-g]b?\d_{art}_rr1\.wav", path):
                continue
            dest = raw / Path(path).name
            fetch(f"https://raw.githubusercontent.com/sfzinstruments/aliexpress-erhu/main/{path}", dest)
            clip = decode(dest)
            clip = fade(clip[: int(SR * (4.5 if bank == "erhu-long" else 1.2))], out=0.08)
            # 文件名里的八度和 MIDI 不一致，以 SFZ 的 pitch_keycenter 为准
            sfz_name = "erhu_sus_map.sfz" if art == "sus" else "erhu_stac_map.sfz"
            sfz_path = raw / sfz_name
            fetch(
                f"https://raw.githubusercontent.com/sfzinstruments/aliexpress-erhu/main/Programs/modules/maps/{sfz_name}",
                sfz_path,
            )
            keycenters = dict(re.findall(r"sample=.*?erhu_([a-g]b?\d)_" + art + r"_rr1\.wav\s+lokey=(\d+)", sfz_path.read_text(encoding="utf-8")))
            token = re.search(r"erhu_([a-g]b?\d)_", Path(path).name).group(1)
            notes[int(keycenters[token])] = clip
        banks[bank] = save_bank(bank, notes, bank == "erhu-long")

    # 笛子、琵琶、古琴：整段示范录音，按起音切开
    # upload.wikimedia.org 从这里会被限流，走 Internet Archive 的原文件镜像
    mirror = "https://web.archive.org/web/2024id_/"
    singles = {
        "dizi": mirror + "https://upload.wikimedia.org/wikipedia/commons/a/a5/DiZi_Chinese_Flute_Sample.ogg",
        "pipa": mirror + "https://upload.wikimedia.org/wikipedia/commons/5/51/Pipa_-_sound.ogg",
    }
    dest = raw / "dizi.ogg"
    fetch(singles["dizi"], dest)
    banks["dizi"] = save_bank("dizi", pitch_regions(dest, 2.6), True)
    dest = raw / "pipa.ogg"
    fetch(singles["pipa"], dest)
    pipa = pitch_regions(dest, 1.6, floor=0.02)
    if pipa:
        root = max(pipa, key=lambda m: len(pipa[m]))
        pipa = resample_to(pipa[root], root, 52, 86, 2)
    banks["pipa"] = save_bank("pipa", pipa, False)
    guqin: dict[int, np.ndarray] = {}
    for name, url in (
        ("zheng.ogg", mirror + "https://upload.wikimedia.org/wikipedia/commons/b/b5/Zheng_diao.ogg"),
        ("fanyin.ogg", mirror + "https://upload.wikimedia.org/wikipedia/commons/6/66/Fanyin.ogg"),
    ):
        dest = raw / name
        fetch(url, dest)
        for midi, clip in pitch_regions(dest, 2.2, floor=0.02).items():
            if midi not in guqin or len(clip) > len(guqin[midi]):
                guqin[midi] = clip
    banks["guqin"] = save_bank("guqin", guqin, False)

    # 洞箫：没有逐音采样。FluidR3 的尺八是竖吹竹管录音，文件名用降号
    xiao: dict[int, np.ndarray] = {}
    spell = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"]
    for midi in range(57, 89):
        name = f"{spell[midi % 12]}{midi // 12 - 1}"
        dest = raw / f"shakuhachi-{name}.mp3"
        url = f"https://raw.githubusercontent.com/gleitz/midi-js-soundfonts/gh-pages/FluidR3_GM/shakuhachi-mp3/{name}.mp3"
        try:
            fetch(url, dest)
        except Exception as exc:
            print("skip", name, exc)
            continue
        xiao[midi] = fade(decode(dest)[: int(SR * 3.5)], out=0.08)
    banks["xiao"] = save_bank("xiao", xiao, True)

    (OUT / "banks.json").write_text(json.dumps(banks, ensure_ascii=False, indent=2), encoding="utf-8")
    (OUT / "CREDITS.md").write_text(CREDITS, encoding="utf-8")
    missing = [k for k, v in banks.items() if len(v["notes"]) < 3]
    if missing:
        raise SystemExit(f"采样太少: {missing}")


CREDITS = """# 采样来源

播放使用的是乐器录音，不是合成器。除洞箫外，都能对应到该乐器本身的录音；洞箫没有找到可再分发的逐音采样，用同为竖吹竹管的尺八代替，页面上会写明。

| 乐器 | 录音 | 许可 |
| --- | --- | --- |
| 钢琴 | Alexander Holm，Salamander Grand Piano（Yamaha C5），经 [tonejs-instruments](https://github.com/nbrosowsky/tonejs-instruments) 抽取的逐音文件 | CC BY 3.0 |
| 古筝 | Pufermufin 的古筝录音（[Freesound 396868](https://freesound.org/people/Pufermufin/sounds/396868/)），经 [XSXB-Band-Samples](https://github.com/sparklecatta-lang/XSXB-Band-Samples) 按音高整理 | CC0 |
| 二胡 | D. Smolken，[Aliexpress Erhu](https://github.com/sfzinstruments/aliexpress-erhu) | CC0 |
| 竹笛 | Gorgoroth6669，[DiZi Chinese Flute Sample](https://commons.wikimedia.org/wiki/File:DiZi_Chinese_Flute_Sample.ogg) | CC0 |
| 洞箫 | Frank Wen，FluidR3 GM 中的尺八采样（[midi-js-soundfonts](https://github.com/gleitz/midi-js-soundfonts)）。尺八与洞箫同为竖吹，不是洞箫本身 | MIT |
| 琵琶 | Francesc Fort（TaronjaSatsuma），素材亦署东北师范大学民族乐团，[Pipa - sound](https://commons.wikimedia.org/wiki/File:Pipa_-_sound.ogg)。原录音几乎是同一个音，其余音高由这段拨弦变速得到 | CC BY-SA 4.0 |
| 古琴 | Charlie Huang，[Zheng diao](https://commons.wikimedia.org/wiki/File:Zheng_diao.ogg) 与 [Fanyin](https://commons.wikimedia.org/wiki/File:Fanyin.ogg)，2006，已放进公有领域。本站按起音切成单音 | 公有领域 |

钢琴保留原 mp3。其余录音转为单声道 mp3。没有逐音原档的笛子、琵琶、古琴，是从一段示范里切出来的，缺的音高靠相邻采样变速，超过三度以后音色会发紧。
"""

if __name__ == "__main__":
    main()
