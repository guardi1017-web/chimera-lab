# 크레딧과 출처

이 저장소에 들어 있는 에셋과 서드파티 코드의 출처, 권리, 상업적 이용 가능 여부를 파일별로 적는다. 저장소 전체의 권리는 [`LICENSE`](LICENSE)(All Rights Reserved)를 따르고, `src/vendor/three/`와 `src/vendor/fonts/`만 예외다.

## 상업 이용 권리 확인 현황
| 구분 | 확인 | 상태 |
|---|---|---|
| 런타임 3D 에셋 (`assets/*.glb`) | 4/4 | 확인 완료: 소유자 직접 제작, 상업적 이용 가능 |
| 원화·보관본 (`art/**/*.png`) | 12/12 | 확인 완료: 소유자 직접 제작, 상업적 이용 가능 |
| 서드파티 라이브러리 (`src/vendor/three/`) | 5/5 파일 | 확인 완료: 모두 MIT, 상업적 이용 가능(저작권·허가 고지 유지 조건) |
| 글꼴 (`src/vendor/fonts/`) | 2/2 글꼴 | SIL OFL 1.1, 상업적 이용 가능(라이선스 동봉 조건, 글꼴만 따로 판매 금지) |

## 런타임 3D 모델
게임이 실제로 불러 쓰는 모델이다.

| 파일 | 출처 | 제작 도구·요금제 | 라이선스·권리 | 상업적 이용 |
|---|---|---|---|---|
| `assets/chimera-armor.glb` | 프로젝트 소유자 직접 제작 | Tripo API 유료 크레딧, image_to_model, 2026-11-14·16 생성 | 결과물 권리 사용자 귀속 / All Rights Reserved | 가능 |
| `assets/chimera-beast.glb` | 프로젝트 소유자 직접 제작 | Tripo API 유료 크레딧, image_to_model, 2026-11-14·16 생성 | 결과물 권리 사용자 귀속 / All Rights Reserved | 가능 |
| `assets/chimera-ranger.glb` | 프로젝트 소유자 직접 제작 | Tripo API 유료 크레딧, image_to_model, 2026-11-14·16 생성 | 결과물 권리 사용자 귀속 / All Rights Reserved | 가능 |
| `assets/necromancer.glb` | 프로젝트 소유자 직접 제작 | Tripo API 유료 크레딧, image_to_model, 2026-11-14·16 생성 | 결과물 권리 사용자 귀속 / All Rights Reserved | 가능 |

## 원화 및 보관본
3D 모델을 만들 때 쓴 밑그림이다.

### 현행 원화 (6개)
| 파일 | 출처 | 제작 도구·요금제 | 라이선스·권리 | 상업적 이용 |
|---|---|---|---|---|
| `art/chimera-armor.png` | 프로젝트 소유자 직접 제작 | OpenAI API 유료 요금제 | 결과물 권리 사용자 귀속 / All Rights Reserved | 가능 |
| `art/chimera-beast.png` | 프로젝트 소유자 직접 제작 | OpenAI API 유료 요금제 | 결과물 권리 사용자 귀속 / All Rights Reserved | 가능 |
| `art/chimera-ranger.png` | 프로젝트 소유자 직접 제작 | OpenAI API 유료 요금제 | 결과물 권리 사용자 귀속 / All Rights Reserved | 가능 |
| `art/necromancer.png` | 프로젝트 소유자 직접 제작 | OpenAI API 유료 요금제 | 결과물 권리 사용자 귀속 / All Rights Reserved | 가능 |
| `art/necromancer-v2.png` | 프로젝트 소유자 직접 제작 | OpenAI API 유료 요금제 | 결과물 권리 사용자 귀속 / All Rights Reserved | 가능 |
| `art/necromancer-apose.png` | 프로젝트 소유자 직접 제작 | OpenAI API 유료 요금제 | 결과물 권리 사용자 귀속 / All Rights Reserved | 가능 |

### 이전 버전 보관본 (6개)
| 파일 | 출처 | 제작 도구·요금제 | 라이선스·권리 | 상업적 이용 |
|---|---|---|---|---|
| `art/old/chimera-armor.png` | 프로젝트 소유자 직접 제작 | OpenAI API 유료 요금제 | 결과물 권리 사용자 귀속 / All Rights Reserved | 가능 |
| `art/old/chimera-beast.png` | 프로젝트 소유자 직접 제작 | OpenAI API 유료 요금제 | 결과물 권리 사용자 귀속 / All Rights Reserved | 가능 |
| `art/old/chimera-ranger.png` | 프로젝트 소유자 직접 제작 | OpenAI API 유료 요금제 | 결과물 권리 사용자 귀속 / All Rights Reserved | 가능 |
| `art/old/v2/chimera-armor.png` | 프로젝트 소유자 직접 제작 | OpenAI API 유료 요금제 | 결과물 권리 사용자 귀속 / All Rights Reserved | 가능 |
| `art/old/v2/chimera-beast.png` | 프로젝트 소유자 직접 제작 | OpenAI API 유료 요금제 | 결과물 권리 사용자 귀속 / All Rights Reserved | 가능 |
| `art/old/v2/chimera-ranger.png` | 프로젝트 소유자 직접 제작 | OpenAI API 유료 요금제 | 결과물 권리 사용자 귀속 / All Rights Reserved | 가능 |

## 서드파티 라이브러리 (`src/vendor/three/`)
저장소의 [`LICENSE`](LICENSE)(All Rights Reserved)를 따르지 않고 아래 라이선스를 따른다. 라이선스 전문은 [`src/vendor/three/LICENSE`](src/vendor/three/LICENSE)에 있다. 아래 내용은 각 파일의 머리말과 그 LICENSE 파일을 직접 읽고 확인한 것이다.

| 파일 | 출처 | 확인한 근거 | 라이선스 | 상업적 이용 | 라이선스 파일 |
|---|---|---|---|---|---|
| `three.module.min.js` | three.js, three@0.170.0 `build/three.module.min.js` | 파일 머리말 `@license Copyright 2010-2024 Three.js Authors`, `SPDX-License-Identifier: MIT` | MIT (Copyright © 2010-2024 three.js authors) | 가능(고지 유지) | `src/vendor/three/LICENSE` |
| `GLTFLoader.js` | three.js, three@0.170.0 `examples/jsm/loaders/GLTFLoader.js` | 파일에 머리말 없음. 출처는 `src/vendor/three/LICENSE`의 vendored 목록 | MIT (three.js) | 가능(고지 유지) | `src/vendor/three/LICENSE` |
| `BufferGeometryUtils.js` | three.js, three@0.170.0 `examples/jsm/utils/BufferGeometryUtils.js` | 파일에 머리말 없음. 출처는 `src/vendor/three/LICENSE`의 vendored 목록 | MIT (three.js) | 가능(고지 유지) | `src/vendor/three/LICENSE` |
| `SkeletonUtils.js` | three.js, three@0.170.0 `examples/jsm/utils/SkeletonUtils.js` | 파일에 머리말 없음. 출처는 `src/vendor/three/LICENSE`의 vendored 목록 | MIT (three.js) | 가능(고지 유지) | `src/vendor/three/LICENSE` |
| `meshopt_decoder.module.js` | meshoptimizer (https://github.com/zeux/meshoptimizer), three@0.170.0 `examples/jsm/libs/meshopt_decoder.module.js`로 들어온 것. 파일 안 주석상 meshoptimizer 0.18에서 빌드 | 파일 머리말 `This file is part of meshoptimizer library and is distributed under the terms of MIT License.`, `Copyright (C) 2016-2022, by Arseny Kapoulkine` | MIT (Copyright (c) 2016-2022, Arseny Kapoulkine). three.js와는 저작권자가 다르다 | 가능(고지 유지) | `src/vendor/three/LICENSE`(meshoptimizer 절) |

MIT 조건: 이 파일들을 복사하거나 배포할 때는 위 저작권 고지와 허가 고지를 함께 넣어야 한다. `src/vendor/three/LICENSE`를 지우거나 고치지 않는다.

## 글꼴 (`src/vendor/fonts/`)
저장소의 [`LICENSE`](LICENSE)(All Rights Reserved)를 따르지 않고 SIL Open Font License 1.1을 따른다. 원문은 [`src/vendor/fonts/LICENSE`](src/vendor/fonts/LICENSE)에 있다(`sync_fonts.py`가 내려받아 'SIL OPEN FONT LICENSE'·'Version 1.1'을 확인한 뒤 기록한다). 화면이 외부 Google Fonts를 부르지 않고 이 파일을 `@font-face`로 쓴다.

| 파일 | 글꼴 | 제작자/프로젝트 | 원본 출처 | 라이선스 | 상업적 이용 |
|---|---|---|---|---|---|
| `src/vendor/fonts/GowunBatang-Bold.subset.woff2` | 고운바탕(Gowun Batang) Bold 700 | Gowun Batang 프로젝트 저작자(저작권 줄은 `src/vendor/fonts/LICENSE`의 OFL 원문) | 라이선스: google/fonts `ofl/gowunbatang/OFL.txt`, 글꼴: Google Fonts css2 `family=Gowun+Batang:wght@700&text=` 서브셋 | SIL OFL 1.1 | 가능(라이선스 동봉) |
| `src/vendor/fonts/GowunDodum-Regular.subset.woff2` | 고운돋움(Gowun Dodum) Regular 400 | Gowun Dodum 프로젝트 저작자(저작권 줄은 `src/vendor/fonts/LICENSE`의 OFL 원문) | 라이선스: google/fonts `ofl/gowundodum/OFL.txt`, 글꼴: Google Fonts css2 `family=Gowun+Dodum&text=` 서브셋 | SIL OFL 1.1 | 가능(라이선스 동봉) |

- `src/vendor/fonts/chars.txt`: 서브셋에 넣은 글자(UTF-8). `src/page.html`, `src/render.js`, `src/sim.js`, `src/render3d.js`의 모든 비ASCII 글자와 출력 가능한 ASCII.
- 다시 만들기: `python src/vendor/sync_fonts.py` 실행 후 `python src/vendor/build_pages.py`(또는 `node build.cjs`).
- **주의:** 화면 문구에 새 한글이나 다른 비ASCII 글자를 넣으면 서브셋에 그 글자가 없다. 위 두 명령을 다시 실행한다(`node test.cjs`가 빠진 글자를 알려 준다).
- OFL 조건: 글꼴 파일을 배포할 때 `src/vendor/fonts/LICENSE`를 함께 넣고, 글꼴만 따로 팔지 않는다. 이 LICENSE를 지우지 않는다.

## 새 에셋을 넣을 때
- 에셋이나 서드파티 코드를 더하거나 바꾸거나 지우면 **같은 커밋에서 CREDITS.md도 고친다.** 파일 하나에 한 줄씩, 출처·제작 도구와 요금제·라이선스와 권리·상업적 이용 가능 여부를 적고, 맨 위 확인 현황표의 숫자도 맞춘다.
- 서드파티 파일은 파일 머리말과 라이선스 전문을 직접 읽고 확인한 것만 적는다. 라이선스 전문은 `src/vendor/` 아래에 함께 둔다.

## 저장소 밖에 둘 증빙
- Tripo API·OpenAI API 유료 결제 영수증과, 생성한 날 기준의 이용 약관(결과물 권리·상업 이용 조항)을 저장소 밖에 보관해 둘 것을 권한다. 권리를 물어 올 때 근거가 된다.
- **이 저장소는 공개다.** API 키, 결제 정보, 영수증 원본은 저장소에 커밋하지 않는다.
