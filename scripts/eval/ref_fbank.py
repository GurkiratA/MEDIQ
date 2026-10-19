import sys, wave, json, numpy as np, kaldi_native_fbank as knf
path, out = sys.argv[1], sys.argv[2]
w = wave.open(path)
assert w.getsampwidth() == 2, w.getsampwidth()
sr, ch = w.getframerate(), w.getnchannels()
x = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32)
if ch > 1: x = x.reshape(-1, ch)[:, 0]
x = x[: sr * 4]  # first 4 seconds is plenty for a numeric check
o = knf.FbankOptions()
o.frame_opts.dither = 0; o.frame_opts.snip_edges = True; o.frame_opts.window_type = 'hamming'
o.frame_opts.samp_freq = sr; o.mel_opts.num_bins = 80; o.mel_opts.low_freq = 20; o.mel_opts.high_freq = 0
o.energy_floor = 0
f = knf.OnlineFbank(o); f.accept_waveform(sr, x.tolist()); f.input_finished()
feats = np.stack([f.get_frame(i) for i in range(f.num_frames_ready)])
json.dump({"sr": sr, "pcm": (x / 32768).tolist(), "feats": feats.tolist()}, open(out, "w"))
print(path, "sr", sr, "ch", ch, "frames", feats.shape)
