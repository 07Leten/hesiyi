"""把两套复原谱导入 public/data。

复原示例：模型预测的 MusicXML（同一词牌常有复原 1 / 复原 2）。
按复核标记-纯唱词版：魏氏乐谱的 MuseScore 文件，只保留唱词。

两套都标成未审定，不写入文献来源。028、189 只有图片，没有乐谱，不导入。
"""

from __future__ import annotations

import hashlib
import json
import re
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PRED_DIR = Path(r"d:\TEMPS\复原示例")
REST_DIR = Path(r"d:\TEMPS\按复核标记-纯唱词版")
DEMO_TUNES = ROOT / "public" / "data" / "demo" / "tune-patterns.json"
OUT_PRED = ROOT / "public" / "data" / "predicted"
OUT_REST = ROOT / "public" / "data" / "restored"

STEP = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}
SCALE = [0, 2, 4, 5, 7, 9, 11]
TYPE_Q = {
    "longa": 16, "breve": 8, "whole": 4, "half": 2, "quarter": 1,
    "eighth": 0.5, "16th": 0.25, "32nd": 0.125, "64th": 1 / 64, "128th": 1 / 128,
}
PUNCT = "，。？！；：、·“”‘’「」『』《》（）()／"
ASCII_PUNCT = {",": "，", ".": "。", "?": "？", "!": "！", ";": "；", ":": "："}
PIANO = (33, 96)
XIAO = (57, 88)


def is_han(c: str) -> bool:
    o = ord(c)
    return 0x3400 <= o <= 0x4DBF or 0x4E00 <= o <= 0x9FFF


def strip_ns(el: ET.Element) -> None:
    for node in el.iter():
        if "}" in node.tag:
            node.tag = node.tag.split("}", 1)[1]


def split_first_syllable(text: str) -> tuple[str, str]:
    seen = False
    for index, char in enumerate(text):
        if not is_han(char):
            continue
        if seen:
            return text[:index], text[index:]
        seen = True
    return text, ""


def clean_lyric(text: str) -> str:
    out = []
    for c in text or "":
        if c in ASCII_PUNCT:
            c = ASCII_PUNCT[c]
        if is_han(c) or c in PUNCT or c == "\n":
            out.append(c)
    return "".join(out)


def tonic_for(fifths: int) -> tuple[str, int]:
    sharp = ["C", "G", "D", "A", "E", "B", "F#", "C#"]
    flat = ["C", "F", "Bb", "Eb", "Ab", "Db", "Gb", "Cb"]
    fifths = max(-7, min(7, fifths))
    name = sharp[fifths] if fifths >= 0 else flat[-fifths]
    midi = 60 + (fifths * 7) % 12
    while midi > 71:
        midi -= 12
    return name, midi


def spell(midi: int, tonic_midi: int, prefer_sharp: bool) -> tuple[int, int, int]:
    rel = midi - tonic_midi
    octv = rel // 12
    pc = rel - octv * 12
    if pc in SCALE:
        return SCALE.index(pc) + 1, 0, octv
    if prefer_sharp and (pc - 1) in SCALE:
        return SCALE.index(pc - 1) + 1, 1, octv
    if pc == 11:
        return 1, -1, octv + 1
    above = (pc + 1) % 12
    return SCALE.index(above) + 1, -1, octv


def visual(beats: float) -> tuple[int, bool, int]:
    for under in range(4):
        unit = 1 / 2**under
        for dots in (0, 1):
            head = unit * (1.5 if dots else 1)
            if beats + 1e-3 < head:
                continue
            ext = beats - head
            if 0 <= ext <= 16 and abs(ext - round(ext)) < 0.03:
                return under, dots == 1, round(ext)
    if beats >= 1:
        whole = max(1, round(beats))
        return 0, False, whole - 1
    if beats >= 0.5:
        return 1, False, 0
    if beats >= 0.25:
        return 2, False, 0
    return 3, False, 0


def lyric_of_musicxml(note: ET.Element) -> str:
    lyrics = note.findall("lyric")
    if not lyrics:
        return ""
    chosen = next((ly for ly in lyrics if ly.get("number") in (None, "1")), lyrics[0])
    return "".join((t.text or "") for t in chosen.findall("text"))


def tie_stop(note: ET.Element) -> bool:
    kinds = [t.get("type") for t in note.findall("tie")]
    kinds += [t.get("type") for t in note.findall("./notations/tied")]
    return "stop" in kinds


def parse_musicxml(path: Path) -> dict:
    root = ET.parse(path).getroot()
    strip_ns(root)
    title = (root.findtext("./work/work-title") or path.stem).strip()
    creator = root.findtext("./identification/creator") or ""
    mode = creator.split("生成")[0].strip()
    part = root.find("part")
    warnings: list[str] = []
    if part is None:
        return {"title": title, "mode": mode, "events": [], "warnings": ["没有声部"]}

    divisions = 1
    fifths = 0
    opening = None
    beat_unit = 4
    beats_per_bar = 4
    score_unit = None
    quarters_per_min = 72.0
    pending = ""
    events = []
    bar = 0
    backups = 0

    def push(rest: bool, midi: int, quarters: float, lyric: str) -> None:
        nonlocal score_unit
        if quarters <= 0:
            return
        if score_unit is None:
            score_unit = beat_unit
        beats = round(quarters * (score_unit / 4), 4)
        if beats <= 0:
            return
        events.append({"rest": rest, "midi": midi, "beats": beats, "lyric": lyric, "bar": bar})

    for measure in part.findall("measure"):
        bar += 1
        for el in list(measure):
            if el.tag == "attributes":
                div = el.findtext("./divisions")
                if div:
                    divisions = max(1, int(div))
                key = el.find("./key/fifths")
                if key is not None and key.text:
                    fifths = int(key.text)
                    if opening is None:
                        opening = fifths
                beats = el.findtext("./time/beats")
                unit = el.findtext("./time/beat-type")
                if beats and unit:
                    beats_per_bar = int(beats)
                    beat_unit = int(unit)
                    if score_unit is None:
                        score_unit = beat_unit
            elif el.tag in ("sound", "direction"):
                sound = el if el.tag == "sound" else el.find(".//sound")
                if sound is not None and sound.get("tempo"):
                    quarters_per_min = float(sound.get("tempo"))
                per = el.find(".//per-minute")
                if per is not None and per.text:
                    quarters_per_min = float(per.text)
            elif el.tag == "backup":
                backups += 1
            elif el.tag == "forward":
                dur = int(el.findtext("duration") or 0)
                push(True, 0, dur / divisions, "")
            elif el.tag == "note":
                if el.find("grace") is not None or el.find("cue") is not None:
                    pending += lyric_of_musicxml(el)
                    continue
                if el.find("chord") is not None:
                    continue
                voice = el.findtext("voice")
                if voice not in (None, "", "1"):
                    continue
                if opening is None:
                    opening = fifths
                dur = int(el.findtext("duration") or 0)
                quarters = dur / divisions
                lyric = "" if tie_stop(el) else pending + lyric_of_musicxml(el)
                pending = ""
                if el.find("rest") is not None:
                    push(True, 0, quarters, "")
                    continue
                step = el.findtext("./pitch/step") or "C"
                alter = int(float(el.findtext("./pitch/alter") or 0))
                octave = int(el.findtext("./pitch/octave") or 4)
                midi = (octave + 1) * 12 + STEP.get(step, 0) + alter
                push(False, midi, quarters, lyric)

    if backups:
        warnings.append(f"有 {backups} 处多声部回退，只保留了第 1 声部")
    unit = score_unit or beat_unit
    tempo = int(round(quarters_per_min * (unit / 4)))
    return {
        "title": title,
        "mode": mode,
        "events": events,
        "warnings": warnings,
        "fifths": 0 if opening is None else opening,
        "beats_per_bar": beats_per_bar,
        "beat_unit": unit,
        "tempo": max(36, min(200, tempo)),
    }


def length_quarters(el: ET.Element, division: int, beats_per_bar: int, beat_unit: int) -> float:
    raw = (el.findtext("duration") or "").strip()
    if re.fullmatch(r"-?\d+", raw):
        return int(raw) / division
    kind = el.findtext("durationType") or "quarter"
    if kind == "measure":
        return beats_per_bar * 4 / max(1, beat_unit)
    q = TYPE_Q.get(kind, 1)
    dots_text = (el.findtext("dots") or "").strip()
    dots = int(dots_text) if dots_text.isdigit() else len(el.findall("dots"))
    for _ in range(dots):
        q *= 1.5
    tup = el.find("Tuplet")
    if tup is not None:
        actual = float(tup.findtext("actualNotes") or 1)
        normal = float(tup.findtext("normalNotes") or 1)
        if actual:
            q *= normal / actual
    return q


def lyric_map(el: ET.Element) -> dict[int, str]:
    found: dict[int, str] = {}
    for ly in el.findall("Lyrics"):
        raw = (ly.findtext("no") or "").strip()
        key = int(raw) if raw.isdigit() else 0
        found[key] = found.get(key, "") + (ly.findtext("text") or "")
    return found


def has_han(text: str) -> bool:
    return any(is_han(c) for c in clean_lyric(text))


def flatten_verses(events: list[dict]) -> tuple[list[dict], str]:
    """同一时刻不重叠的唱词连成一段；对齐得上的叠句再唱一遍；对不齐的留在题下。"""
    positions: dict[int, list[int]] = {}
    for index, ev in enumerate(events):
        if ev["rest"]:
            continue
        for key, text in ev.get("lyrics", {}).items():
            if has_han(text):
                positions.setdefault(key, []).append(index)
    if not positions:
        return events, ""

    order = sorted(positions, key=lambda key: (positions[key][0], key))
    primary: list[int] = []
    used: set[int] = set()
    for key in order:
        idx = set(positions[key])
        if idx & used:
            continue
        primary.append(key)
        used |= idx

    for ev in events:
        if ev["rest"]:
            ev["lyric"] = ""
            continue
        parts = [ev.get("lyrics", {}).get(key, "") for key in primary]
        ev["lyric"] = "".join(parts)

    primary_idx = [i for i, ev in enumerate(events) if not ev["rest"] and has_han(ev["lyric"])]
    sequence = events
    extras = []
    for key in order:
        if key in primary:
            continue
        alt_idx = positions[key]
        if alt_idx == primary_idx:
            copy = []
            for ev in events:
                item = {k: v for k, v in ev.items() if k != "lyrics"}
                item["lyric"] = "" if ev["rest"] else ev.get("lyrics", {}).get(key, "")
                copy.append(item)
            last_bar = max(ev["bar"] for ev in sequence)
            for item in copy:
                item["bar"] += last_bar
            sequence = sequence + copy
        else:
            text = "".join(events[i].get("lyrics", {}).get(key, "") for i in alt_idx)
            text = prettify(clean_lyric(text))
            if text:
                extras.append(text)
    for ev in sequence:
        ev.pop("lyrics", None)
    preface = ""
    if extras:
        preface = "同曲还有没能按音对齐的唱词：\n" + "\n".join(extras)
    return sequence, preface


def parse_mscz(path: Path) -> dict:
    with zipfile.ZipFile(path) as zf:
        name = next(n for n in zf.namelist() if n.endswith(".mscx"))
        root = ET.fromstring(zf.read(name))
    division = int(root.findtext(".//Division") or 480)
    title = path.stem.split("_", 1)[-1]
    composer = ""
    for meta in root.findall(".//metaTag"):
        if meta.get("name") == "workTitle" and (meta.text or "").strip():
            title = meta.text.strip()
        if meta.get("name") == "composer" and (meta.text or "").strip():
            composer = meta.text.strip()
    staves = [s for s in root.findall(".//Staff") if s.find("Measure") is not None]
    staff = next((s for s in staves if s.get("id") in (None, "1")), staves[0] if staves else None)
    warnings: list[str] = []
    if staff is None:
        return {"title": title, "mode": "", "events": [], "warnings": ["没有谱表"]}

    fifths = 0
    opening = None
    beat_unit = 4
    beats_per_bar = 4
    score_unit = None
    quarters_per_min = 72.0
    pending = ""
    tie_next = False
    events = []
    bar = 0

    def push(rest: bool, midi: int, quarters: float, lyric) -> None:
        nonlocal score_unit
        if quarters <= 0:
            return
        if score_unit is None:
            score_unit = beat_unit
        beats = round(quarters * (score_unit / 4), 4)
        if beats <= 0:
            return
        item = {"rest": rest, "midi": midi, "beats": beats, "lyric": "", "bar": bar}
        if isinstance(lyric, dict):
            item["lyrics"] = lyric
        else:
            item["lyric"] = lyric
        events.append(item)

    for measure in staff.findall("Measure"):
        bar += 1
        voice = measure.find("voice")
        if voice is None:
            continue
        for el in list(voice):
            if el.tag == "KeySig":
                text = el.findtext("concertKey")
                if text:
                    fifths = int(text)
                    if opening is None:
                        opening = fifths
            elif el.tag == "TimeSig":
                beats_per_bar = int(el.findtext("sigN") or beats_per_bar)
                beat_unit = int(el.findtext("sigD") or beat_unit)
                if score_unit is None:
                    score_unit = beat_unit
            elif el.tag == "Tempo":
                text = el.findtext("tempo")
                if text:
                    value = float(text)
                    quarters_per_min = value * 60 if value < 20 else value
            elif el.tag in ("Chord", "Rest"):
                if opening is None:
                    opening = fifths
                kind = el.findtext("durationType") or ""
                if el.find("grace") is not None or kind in ("grace", "appoggiatura", "acciaccatura"):
                    pending += "".join((ly.findtext("text") or "") for ly in el.findall("Lyrics"))
                    continue
                quarters = length_quarters(el, division, beats_per_bar, beat_unit)
                if el.tag == "Rest":
                    tie_next = False
                    push(True, 0, quarters, "")
                    continue
                pitches = []
                for note in el.findall("Note"):
                    staff_no = note.findtext("staff")
                    if staff_no not in (None, "", "1"):
                        continue
                    pitch = note.findtext("pitch")
                    if pitch:
                        pitches.append(int(pitch))
                if not pitches:
                    continue
                lyrics = {}
                if not tie_next:
                    lyrics = lyric_map(el)
                    if pending and lyrics is not None:
                        first = min(lyrics) if lyrics else 0
                        lyrics[first] = pending + lyrics.get(first, "")
                pending = ""
                tie_next = el.find(".//Tie") is not None
                push(False, max(pitches), quarters, lyrics)

    unit = score_unit or beat_unit
    tempo = int(round(quarters_per_min * (unit / 4)))
    events, preface = flatten_verses(events)
    signed = composer if any(is_han(c) for c in composer) else ""
    return {
        "title": title,
        "mode": "",
        "composer": signed,
        "preface": preface,
        "events": events,
        "warnings": warnings,
        "fifths": 0 if opening is None else opening,
        "beats_per_bar": beats_per_bar,
        "beat_unit": unit,
        "tempo": max(36, min(200, tempo)),
    }


def split_pred_title(title: str) -> tuple[str, str]:
    match = re.match(r"^(.*?)（复原\s*(\d+)[^）]*）\s*$", title)
    if not match:
        return title.strip() or "未题", ""
    return match.group(1).strip() or "未题", match.group(2)


def first_line(text: str) -> str:
    line = text.split("\n", 1)[0]
    for sep in "，。？！、；：":
        line = line.split(sep, 1)[0]
    line = line.strip()
    return line[:14] or "无题"


def prettify(text: str) -> str:
    out = []
    for c in text:
        if c == "\n":
            if out and out[-1] != "\n":
                out.append("\n")
            continue
        out.append(c)
        if c in "。！？" and (len(out) < 2 or out[-2] != "\n"):
            out.append("\n")
    return "".join(out).strip()


def banyan_name(beats: int, unit: int) -> str:
    if beats == 4 and unit == 4:
        return "一板三眼"
    if beats == 2 and unit == 4:
        return "一板一眼"
    if beats == 1:
        return "有板无眼"
    return f"{beats}/{unit}"


def covering_shift(midis: list[int], bounds: tuple[int, int]) -> int | None:
    if not midis:
        return 0
    lo, hi = bounds
    for shift in (0, 12, -12):
        if all(lo <= m + shift <= hi for m in midis):
            return shift
    return None


def shift_label(shift: int) -> str:
    if shift == 12:
        return "（高八度）"
    if shift == -12:
        return "（低八度）"
    return ""


def build_piece(parsed: dict, origin: str, score_id: str, poem_id: str, tune_id: str, author_id: str, dynasty: str, status: str, source_title: str, source_detail: str, note: str, version: str) -> tuple[dict, dict, dict, list[dict], dict]:
    tonic_name, tonic_midi = tonic_for(parsed["fifths"])
    prefer_sharp = parsed["fifths"] >= 0
    lyrics_raw = []
    overflow = []
    notes = []
    beat = 0.0
    current_bar = 0
    syl = -1
    multi = 0
    midis = []

    for ev in parsed["events"]:
        if ev["bar"] != current_bar:
            current_bar = ev["bar"]
        under, dotted, ext = visual(ev["beats"])
        if ev["rest"]:
            pitch = {"degree": 0, "octave": 0, "accidental": 0}
            syllable = None
            melisma = False
        else:
            degree, acc, octv = spell(ev["midi"], tonic_midi, prefer_sharp)
            pitch = {"degree": degree, "octave": octv, "accidental": acc}
            text = clean_lyric(ev["lyric"])
            hans = [c for c in text if is_han(c)]
            if hans:
                syl += 1
                syllable = syl
                melisma = False
                head, rest = split_first_syllable(text)
                lyrics_raw.append(head)
                if rest:
                    multi += 1
                    overflow.append(rest)
            elif syl >= 0:
                syllable = syl
                melisma = True
            else:
                syllable = None
                melisma = False
            midis.append(ev["midi"])
        item = {
            "id": f"{score_id}-n{len(notes)}",
            "index": len(notes),
            "bar": max(1, ev["bar"]),
            "startBeat": round(beat, 4),
            "duration": ev["beats"],
            "extensionBeats": ext,
            "dotted": dotted,
            "underlines": under,
            "pitch": pitch,
            "isRest": ev["rest"],
            "syllableIndex": syllable,
            "isMelisma": melisma,
        }
        notes.append(item)
        beat += ev["beats"]

    lyrics = prettify("".join(lyrics_raw))
    if overflow:
        spilled = prettify(clean_lyric("".join(overflow)))
        if spilled:
            prev = parsed.get("preface") or ""
            parsed["preface"] = (prev + "\n" if prev else "") + "有些字挤在同一个音上，没有逐字配音：" + spilled
    title_line = first_line(lyrics) if lyrics else parsed["title"]
    ver = f"复原 {version}" if version else ""
    if origin == "model":
        score_title = f"{parsed['tune']} · {title_line}（模型预测{(' ' + ver) if ver else ''}）"
        poem_title = f"{ver} · {title_line}" if ver else title_line
    else:
        score_title = f"{parsed['tune']} · {title_line}（唱词清理）"
        poem_title = title_line

    piano = covering_shift(midis, PIANO)
    xiao = covering_shift(midis, XIAO)
    performances = []
    prov = {"origin": origin, "revisionStatus": status, "note": note}
    if piano is not None:
        performances.append({
            "id": f"{score_id}-piano",
            "scoreId": score_id,
            "title": f"钢琴{shift_label(piano)}",
            "layers": [{"instrumentId": "piano", "presetId": "sanjiao", "gain": 0.7, "octaveShift": piano}],
            "source": {"kind": "sample", "note": "三角钢琴逐音录音。" + ("原位每个音都有录音。" if piano == 0 else "原位盖不住，这一版用的是另一组八度的录音，没有变速。")},
            "provenance": prov,
        })
    if xiao is not None:
        performances.append({
            "id": f"{score_id}-xiao",
            "scoreId": score_id,
            "title": f"洞箫{shift_label(xiao)}",
            "layers": [{"instrumentId": "xiao", "presetId": "zizhu", "gain": 0.8, "octaveShift": xiao}],
            "source": {"kind": "sample", "note": "尺八逐音录音，暂代洞箫。" + ("原位每个音都有录音。" if xiao == 0 else "原位盖不住，这一版用的是另一组八度的录音，没有变速。")},
            "provenance": prov,
        })
    if piano is not None and xiao is not None:
        performances.append({
            "id": f"{score_id}-both",
            "scoreId": score_id,
            "title": "箫与钢琴",
            "layers": [
                {"instrumentId": "xiao", "presetId": "zizhu", "gain": 0.65, "octaveShift": xiao},
                {"instrumentId": "piano", "presetId": "sanjiao", "gain": 0.45, "octaveShift": piano},
            ],
            "source": {"kind": "sample", "note": "两件乐器都只在自己有录音的音上出声。"},
            "provenance": prov,
        })

    extra = []
    if piano is None:
        extra.append("钢琴录音盖不住曲中全部音高，因此没有钢琴演奏版本。")
    if xiao is None:
        extra.append("洞箫录音盖不住曲中全部音高，因此没有洞箫演奏版本。")
    annotations = [{"text": "工尺字由简谱级数推导，不是原谱工尺。"}, *({"text": t} for t in extra)]

    poem = {
        "id": poem_id,
        "tunePatternId": tune_id,
        "title": poem_title,
        "authorId": author_id,
        "dynasty": dynasty,
        "text": lyrics,
        "note": note,
        **({"preface": parsed["preface"]} if parsed.get("preface") else {}),
        "provenance": {"origin": origin, "revisionStatus": status, "sourceTitle": source_title, "sourceDetail": source_detail, "note": note},
    }
    score = {
        "id": score_id,
        "poemId": poem_id,
        "tunePatternId": tune_id,
        "title": score_title,
        "provenance": {"origin": origin, "revisionStatus": status, "sourceTitle": source_title, "sourceDetail": source_detail, "note": note},
        "key": {"tonic": tonic_name, "tonicMidi": tonic_midi, **({"gongcheKey": "小工调", "shangDegree": 1} if tonic_name == "D" else {"shangDegree": 1})},
        "meter": {"beatsPerBar": parsed["beats_per_bar"], "beatUnit": parsed["beat_unit"], "banyan": banyan_name(parsed["beats_per_bar"], parsed["beat_unit"])},
        "tempo": parsed["tempo"],
        "notation": {"primary": "jianpu"},
        "lyrics": lyrics,
        "notes": notes,
        "annotations": annotations,
    }
    stats = {
        "id": score_id,
        "notes": len(notes),
        "pitched": len(midis),
        "han": sum(1 for c in lyrics if is_han(c)),
        "syllables": syl + 1,
        "multi": multi,
        "piano": piano,
        "xiao": xiao,
        "warnings": parsed["warnings"],
        "low": min(midis) if midis else None,
        "high": max(midis) if midis else None,
    }
    return poem, score, {"tune": parsed["tune"]}, performances, stats


def tune_record(name: str, tune_id: str, origin: str) -> dict:
    return {
        "id": tune_id,
        "name": name,
        "aliases": [],
        "summary": f"「{name}」来自导入的复原谱。句式、平仄和押韵都还没有按词谱整理，这里不补写。",
        "provenance": {
            "origin": origin,
            "revisionStatus": "unverified",
            "note": "只凭曲名建了一条词牌，未与《钦定词谱》核对。",
        },
    }


def existing_tune_ids() -> dict[str, str]:
    found = {}
    for tune in json.loads(DEMO_TUNES.read_text(encoding="utf-8")):
        found[tune["name"]] = tune["id"]
        for alias in tune.get("aliases") or []:
            found[alias] = tune["id"]
    return found


def new_tune_id(name: str) -> str:
    digest = hashlib.md5(name.encode("utf-8")).hexdigest()[:10]
    return f"cipai-{digest}"


def review_of(path: Path) -> tuple[str, str]:
    parts = path.parts
    if "待复核" in parts:
        group = next((p for p in ("P0", "P1", "P2") if p in parts), "")
        detail = "待复核" + (f" · {group}" if group else "")
        return "draft", detail
    if "未人工复核" in parts:
        return "unverified", "未人工复核 · 无自动报警"
    return "unverified", "唱词清理"


def collect_predicted() -> list[dict]:
    rows = []
    for path in PRED_DIR.rglob("*.musicxml"):
        if "__MACOSX" in path.parts:
            continue
        parsed = parse_musicxml(path)
        tune, version = split_pred_title(parsed["title"])
        parsed["tune"] = tune
        parsed["version"] = version
        parsed["catalog"] = path.stem
        rows.append(parsed)
    rows.sort(key=lambda r: (r["tune"], r["version"], r["catalog"]))
    return rows


def collect_restored() -> list[dict]:
    rows = []
    for path in REST_DIR.rglob("*.mscz"):
        if "__MACOSX" in path.parts:
            continue
        parsed = parse_mscz(path)
        status, detail = review_of(path)
        number = ""
        match = re.match(r"(\d+)", path.stem)
        if match:
            number = match.group(1)
        parsed["tune"] = parsed["title"]
        parsed["version"] = ""
        parsed["catalog"] = number or path.stem
        parsed["status"] = status
        parsed["detail"] = detail
        rows.append(parsed)
    rows.sort(key=lambda r: r["catalog"])
    return rows


def dump(folder: Path, tunes: list[dict], author: dict, poems: list[dict], scores: list[dict], performances: list[dict]) -> None:
    folder.mkdir(parents=True, exist_ok=True)
    files = {
        "tune-patterns.json": tunes,
        "authors.json": [author],
        "poems.json": poems,
        "scores.json": scores,
        "performances.json": performances,
    }
    for name, data in files.items():
        (folder / name).write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def main() -> None:
    known = existing_tune_ids()
    predicted = collect_predicted()
    restored = collect_restored()
    tune_origin = {}
    for row in predicted:
        tune_origin.setdefault(row["tune"], "model")
    for row in restored:
        tune_origin[row["tune"]] = "restore"

    def tune_id_for(name: str) -> str:
        return known.get(name) or new_tune_id(name)

    pred_tunes = []
    rest_tunes = []
    seen_pred = set()
    seen_rest = set()

    def take_tune(bucket: list[dict], seen: set[str], name: str) -> str:
        tid = tune_id_for(name)
        if name not in known and tid not in seen:
            seen.add(tid)
            bucket.append(tune_record(name, tid, tune_origin.get(name, "model")))
        return tid

    pred_poems, pred_scores, pred_perfs, pred_stats = [], [], [], []
    for i, row in enumerate(predicted, 1):
        if not any(not ev["rest"] for ev in row["events"]):
            pred_stats.append({"id": f"pred-{i:03d}", "skip": True, "warnings": row["warnings"]})
            continue
        sid = f"pred-{i:03d}"
        tid = take_tune(pred_tunes, seen_pred, row["tune"])
        note = "模型预测得到的旋律，不是文献译谱，也未经人工审定。"
        if row["mode"]:
            note += f" 文件里的调名是「{row['mode']}」，不把它当成作者。"
        poem, score, _, perfs, stats = build_piece(
            row, "model", sid, sid, tid, "model-unsigned", "近现代", "unverified",
            "模型预测谱", " ".join(p for p in (f"复原 {row['version']}" if row["version"] else "", row["mode"]) if p),
            note, row["version"],
        )
        pred_poems.append(poem)
        pred_scores.append(score)
        pred_perfs.extend(perfs)
        pred_stats.append(stats)

    rest_poems, rest_scores, rest_perfs, rest_stats = [], [], [], []
    for row in restored:
        if not any(not ev["rest"] for ev in row["events"]):
            rest_stats.append({"id": f"res-{row['catalog']}", "skip": True, "warnings": row["warnings"]})
            continue
        sid = f"res-{row['catalog']}"
        tid = take_tune(rest_tunes, seen_rest, row["tune"])
        if row["status"] == "draft":
            note = "旋律来自既有识谱，这里只保留了唱词。它排在「待复核」里：自动分类不是人工审定。"
        else:
            note = "旋律来自既有识谱，这里只保留了唱词。它尚未人工复核；没有自动报警也不等于已经核对过。"
        if row.get("composer"):
            note += f" 文件里写着「{row['composer']}」，这里不据此改定作者。"
        poem, score, _, perfs, stats = build_piece(
            row, "restore", sid, sid, tid, "weishi-unsigned", "明", row["status"],
            "魏氏乐谱唱词清理稿", f"{row['catalog']} · {row['detail']}", note, "",
        )
        rest_poems.append(poem)
        rest_scores.append(score)
        rest_perfs.extend(perfs)
        rest_stats.append(stats)

    pred_author = {
        "id": "model-unsigned",
        "name": "未署名",
        "dynasty": "近现代",
        "bio": "模型预测谱没有可靠的作者信息。调名和生成参数都不是作者。",
        "provenance": {"origin": "model", "revisionStatus": "unverified", "note": "占位，不是历史人物"},
    }
    rest_author = {
        "id": "weishi-unsigned",
        "name": "作者未考",
        "dynasty": "明",
        "period": "魏氏乐谱",
        "bio": "唱词出自《魏氏乐谱》的清理稿。曲集里的作者没有逐首考定，所以不署具体人名。",
        "provenance": {"origin": "restore", "revisionStatus": "unverified", "note": "只标明曲集的时代，不代表每一首的作者已经考定"},
    }
    dump(OUT_PRED, pred_tunes, pred_author, pred_poems, pred_scores, pred_perfs)
    dump(OUT_REST, rest_tunes, rest_author, rest_poems, rest_scores, rest_perfs)

    def report(label: str, stats: list[dict]) -> None:
        used = [s for s in stats if not s.get("skip")]
        skipped = [s for s in stats if s.get("skip")]
        bad = [s for s in used if s["han"] != s["syllables"]]
        no_piano = [s["id"] for s in used if s["piano"] is None]
        no_xiao = [s["id"] for s in used if s["xiao"] is None]
        shifted = [s["id"] for s in used if s["piano"] not in (0, None) or s["xiao"] not in (0, None)]
        lows = [s["low"] for s in used if s["low"] is not None]
        highs = [s["high"] for s in used if s["high"] is not None]
        print(f"{label}: {len(used)} scores, skipped {len(skipped)}, lyric/syllable mismatches {len(bad)}")
        if bad[:8]:
            print("  mismatch", [(s["id"], s["han"], s["syllables"], s["multi"]) for s in bad[:8]])
        print(f"  no piano {len(no_piano)} {no_piano[:6]}  no xiao {len(no_xiao)}")
        print(f"  octave-shifted performances {len(shifted)}")
        if lows:
            print(f"  midi {min(lows)}–{max(highs)}")
        warns = [s for s in used if s["warnings"]]
        if warns:
            print("  warnings", warns[0]["id"], warns[0]["warnings"], "count", len(warns))

    report("predicted", pred_stats)
    report("restored", rest_stats)
    print("tunes", len(pred_tunes), len(rest_tunes), "perfs", len(pred_perfs), len(rest_perfs))


if __name__ == "__main__":
    main()
