"""Генератор звука «pop» (мыльный пузырь) для razrad.
Чистый stdlib: короткий восходящий чирп + экспоненциальное затухание.
"""
import math
import os
import struct
import wave

SR = 44100


def gen(path, f0=330.0, f1=1450.0, dur=0.115, tau=0.021, seed=7, gain=0.9):
    n = int(SR * dur)
    k = math.log(f1 / f0) / dur
    phase = 0.0
    # лёгкий шумовой «щелчок» в начале — характер лопнувшего пузыря
    import random
    rnd = random.Random(seed)
    click = [rnd.uniform(-1.0, 1.0) for _ in range(int(SR * 0.004))]
    samples = []
    for i in range(n):
        t = i / SR
        f = f0 * math.exp(k * t)
        phase += 2.0 * math.pi * f / SR
        env = math.exp(-t / tau)
        atk = min(1.0, t / 0.0007)
        s = (math.sin(phase)
             + 0.30 * math.sin(2.0 * phase)
             + 0.10 * math.sin(3.0 * phase))
        if i < len(click):
            s += click[i] * 0.35 * math.exp(-t / 0.0012)
        s *= env * atk
        s *= 1.0 - (t / dur) ** 8          # гарантированный ноль в конце
        samples.append(s)
    peak = max(abs(s) for s in samples) or 1.0
    data = b''.join(
        struct.pack('<h', int(max(-1.0, min(1.0, s / peak * gain)) * 32767))
        for s in samples
    )
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with wave.open(path, 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(data)
    print(path, len(data), 'bytes')


if __name__ == '__main__':
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    gen(os.path.join(root, 'sounds', 'pop.wav'))