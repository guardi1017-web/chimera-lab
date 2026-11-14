# 키메라 실험실 (가제)

봉쇄된 서울의 밤, 네크로맨서가 키메라 셋에게 적의 혼을 먹여 유전자를 쌓고, 불안정해진 키메라를 터뜨려 봉쇄 초소를 부수고 진압 대장을 잡는 실험판. 키메라는 다음 구역으로 데려가지 않고, 구역마다 맹수 하나로 처음부터 키운다.
핵심 30초가 폰에서 재미있는지 확인하려는 것이고, 완성된 게임이 아니다.

- 해 보기: https://guardi1017-web.github.io/chimera-lab/
- 3D 쿼터뷰(시험 중): https://guardi1017-web.github.io/chimera-lab/3d.html
- 기획 명세: [`docs/superpowers/specs/2026-11-13-chimera-lab-design.md`](docs/superpowers/specs/2026-11-13-chimera-lab-design.md)
- 이어 만들기 지시(집 PC): [`docs/instructions-2026-11-13-next.md`](docs/instructions-2026-11-13-next.md)

## 조작
- 누르고 끌면 네크로맨서가 움직인다. 키메라는 따라와 알아서 싸운다.
- 혼을 밟으면 되살리거나(자리가 비었을 때) 연결선이 닿은 키메라가 먹는다(셋이 찼을 때).
- 키메라를 한 번 톡 누르면 먹일 대상으로 찍는다. 화면을 두 번 톡톡 치면 불안정도가 가장 높은 키메라가 터진다.

## 구조
| 경로 | 내용 |
|---|---|
| `src/sim.js` | 규칙(순수 함수, 시드 재현, DOM 없음). 밸런스 값은 `CFG` |
| `src/render.js` | 화면, 입력, Web Audio 효과음. `window.ChimeraView`가 있으면 판 그리기를 넘긴다 |
| `src/render3d.js` | 3D 쿼터뷰(Three.js, CDN). 규칙은 건드리지 않고 판만 그린다 |
| `src/page.html` | 제목·끝 화면과 색 토큰 |
| `index.html` | 합친 결과물, 2D 판(직접 고치지 않는다) |
| `3d.html` | 합친 결과물, 3D 쿼터뷰 판(직접 고치지 않는다) |
| `test.cjs` | 규칙 테스트와 봇 40판 |
| `smoke.cjs` | 가짜 DOM으로 화면 코드를 끝까지 돌려 보는 확인 |
| `parts-v1/`, `blend-v2/`, `grade-v5/` | 지난 실험판(부위 붙이기, 재료 섞임, 등급 합성) |

```bash
node build.cjs   # src → index.html, 3d.html
node test.cjs    # 규칙과 봇
node smoke.cjs   # 화면 코드 예외 확인
```

설치할 것은 없다(Node만 있으면 된다). 재미 판정은 봇이 아니라 폰에서 직접 해 본 느낌으로 한다.
