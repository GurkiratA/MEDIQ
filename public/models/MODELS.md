# Bundled on-device models

These files are served locally so the demo works offline. They are **not** covered by MEDIQ's MIT licence.
Re-download / verify with `npm run setup:models`.

| File | Purpose | Source | Licence | SHA-256 |
|---|---|---|---|---|
| `wespeaker_en_voxceleb_resnet34.onnx` (26.5 MB) | Speaker embeddings (256-d) for voice verification | WeSpeaker `voxceleb_resnet34`, ONNX export published by k2-fsa/sherpa-onnx (release `speaker-recongition-models`) | Model: **CC BY 4.0** (WeSpeaker: "the pretrained model on VoxCeleb follows the license of the VoxCeleb dataset"). WeSpeaker and sherpa-onnx code: Apache-2.0 | `5ef208a9da1453335308a6b6f4e6dfbd7e183a38b604de0a57664f45d257fe94` |
| `hand_landmarker.task` (7.8 MB) | MediaPipe hand landmarks (21 points) | `storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/` | Apache-2.0 (MediaPipe) | `fbc2a30080c3c557093b5ddfc334698132eb341044ccee322ccf8bcf3607cde1` |

Attribution: WeSpeaker — Wang et al., "WeSpeaker: A Research and Production oriented Speaker Embedding Learning Toolkit" (ICASSP 2023), https://github.com/wenet-e2e/wespeaker. VoxCeleb — Nagrani, Chung, Zisserman et al., https://www.robots.ox.ac.uk/~vgg/data/voxceleb/.
