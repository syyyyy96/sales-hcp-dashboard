# 영업팀 HCP 타겟팅 대시보드 (목업)

Part D 처방 데이터와 Open Payments 지급 데이터를 결합해, 영업 관리자/팀장이 HCP 타겟팅·콜플래닝에 참고할 수 있도록 만든 정적 HTML 목업입니다. PRD는 `PRD_영업팀_HCP타겟팅_대시보드.md` (상위 폴더) 참고.

## 로컬에서 보기

`index.html` 파일을 브라우저로 바로 열면 됩니다. 별도 서버나 빌드 과정이 필요 없습니다.

## GitHub Pages 배포 방법

1. **GitHub에 새 저장소 생성**
   - github.com에서 New repository → 이름 예: `sales-hcp-dashboard`
   - Public으로 설정 (GitHub Pages 무료 사용을 위해 권장)
   - README/gitignore 없이 빈 저장소로 생성

2. **로컬 저장소를 원격 저장소에 연결하고 push**
   이 폴더에는 이미 `git init` + 첫 커밋이 되어 있습니다. 터미널에서 이 폴더로 이동한 뒤:
   ```bash
   git remote add origin https://github.com/<your-username>/sales-hcp-dashboard.git
   git branch -M main
   git push -u origin main
   ```
   (GitHub 로그인 창이 뜨면 본인 계정으로 인증)

3. **GitHub Pages 활성화**
   - 저장소 페이지 → Settings → Pages
   - Source: `Deploy from a branch`
   - Branch: `main` / `/ (root)` 선택 후 Save
   - 몇 분 후 `https://<your-username>.github.io/sales-hcp-dashboard/` 에서 확인 가능

4. **업데이트할 때**
   ```bash
   git add .
   git commit -m "update dashboard"
   git push
   ```
   push 후 1~2분 내 Pages에 자동 반영됩니다.

## 데이터 아키텍처 (Supabase 연동)

이 대시보드는 더 이상 데이터를 `index.html`에 내장하지 않습니다. 대신:

1. **원본 데이터**는 Supabase Postgres의 `part_d_prescriber`, `open_payments` 테이블에 저장됩니다.
2. `scripts/build-dashboard-data.js`가 두 테이블을 조인·집계해서 `dashboard_data` 테이블(단일 행, `payload` jsonb 컬럼)에 저장합니다.
3. `index.html`은 페이지 로드 시 Supabase anon key로 `dashboard_data`를 `fetch`해서 렌더링합니다. RLS로 읽기만 허용됩니다.
4. `.github/workflows/refresh-dashboard-data.yml`이 매일 자동으로 2번 스크립트를 실행해 최신 집계로 갱신합니다 (GitHub Actions 무료 티어, 수동 실행도 Actions 탭 → Run workflow로 가능).

**원본 데이터가 바뀌면:**
- Supabase Table Editor에서 `part_d_prescriber` / `open_payments`를 새 CSV로 다시 채우거나 행을 갱신
- 다음 스케줄(또는 수동 workflow 실행)에서 `dashboard_data`가 자동으로 재계산됨
- `index.html`은 수정·재배포할 필요 없음 — 페이지를 새로고침하면 바로 최신 데이터가 보임

**필요한 GitHub Secret**: `DATABASE_URL` (Supabase Connection Pooler URI, 예: `postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres`) — 저장소 Settings → Secrets and variables → Actions에서 등록.
