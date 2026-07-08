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

## 참고

- 이 목업은 정적 데이터(CSV 집계 결과)가 HTML 안에 내장되어 있어 별도 백엔드가 필요 없습니다.
- 데이터가 갱신되면 `index.html`을 다시 생성해 교체해야 합니다.
