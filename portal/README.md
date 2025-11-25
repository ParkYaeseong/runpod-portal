# RunPod UI Portal

AlphaFold2, DiffDock, PHASTEST 작업을 한 화면에서 제어할 수 있는 풀스택 포털입니다. FastAPI 백엔드와 Next.js 프런트엔드를 Docker Compose로 묶어 NAVER 서버에 쉽게 배포할 수 있습니다.

## 구성

- ackend/: FastAPI 서비스. 사용자 인증, RunPod 작업 생성·폴링, 결과 저장·정리, 아티팩트 다운로드 API 제공.
- rontend/: Next.js + Tailwind UI. 한국어 UX, 파일/폴더 업로드, 결과 시각화(AlphaFold2 3D 뷰어, DiffDock 리스트, PHASTEST HTML 임베드).
- docker-compose.yml: 두 컨테이너를 동시에 띄우고 /data 볼륨에 결과를 보관.

## 빠른 시작

1. 환경 변수 준비
   `ash
   cp backend/.env.example backend/.env
   `
   RUNPOD_API_KEY와 각 *_ENDPOINT_ID를 RunPod 대시보드 값으로 채우세요.

2. 도커 실행
   `ash
   docker compose -f portal/docker-compose.yml up --build -d
   `
   - 백엔드: http://localhost:8400
   - 프런트엔드: http://localhost:3400 (컨테이너 내부 통신은 http://api:8000)

3. 로컬 개발 모드
   `ash
   # 백엔드
   cd portal/backend
   uvicorn app.main:app --reload --port 8400

   # 프런트엔드
   cd portal/frontend
   npm install
   npm run dev -- --port 3400
   `
   필요 시 .env의 STORAGE_ROOT를 로컬 경로로 바꿔 테스트하세요.

## 주요 기능

- **계정/보안**: bcrypt 비밀번호, JWT 토큰, 사용자별 작업 격리.
- **파이프라인 메타**: AlphaFold2/DiffDock/PHASTEST 입력 요구사항을 백엔드에서 정의하면 UI 폼이 자동 생성.
- **업로드 UX**: 파일·폴더 업로드 버튼, 폴더는 브라우저에서 ZIP으로 묶어 전송.
- **상태 모니터링**: RunPod 응답을 주기적으로 폴링해 결과 아카이브를 내려받고 PDB/HTML/CSV를 자동 색인.
- **보관 정책**: RETENTION_DAYS(기본 7일) 이후 입력/출력 디렉터리를 자동 삭제하며, UI 상단에 경고 배너 표시.
- **결과 시각화**: AlphaFold2는 NGL 기반 3D 뷰어, PHASTEST는 HTML 리포트 임베드, DiffDock은 파일 리스트 + 다운로드.

## 확장 아이디어

- RunPod 작업 로그 스트리밍(WebSocket)
- 사용자별 파라미터 프리셋 저장
- NAVER Cloud/AWS S3 등 외부 오브젝트 스토리지 백업 옵션

필요하면 portal 디렉터리를 별도 저장소로 분리해 CI/CD 파이프라인에 연결하세요.
