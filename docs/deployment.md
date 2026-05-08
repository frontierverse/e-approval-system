# 배포 준비 문서

이 문서는 결재온을 운영 환경에 올리기 전에 확인해야 할 항목을 정리한다. 현재 1순위 후보는 Vercel이다.

PostgreSQL 전환 세부 계획은 [PostgreSQL 전환 계획](./postgresql-transition.md)을 함께 본다.

## 현재 결론

Vercel은 Next.js 배포에는 가장 단순한 선택지다. 앱은 PostgreSQL과 Supabase Storage 저장소를 사용할 수 있게 전환되어 있다.

운영 배포 전에 반드시 준비할 것:

- DB: 실제 PostgreSQL `DATABASE_URL`
- 첨부파일: Supabase Storage 버킷을 만들고 Vercel 환경변수에 `ATTACHMENT_STORAGE_DRIVER=supabase-storage`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET` 등록

## 배포 후보

### Vercel

장점:

- Next.js 지원이 가장 좋다.
- GitHub 연결 후 자동 배포와 Preview URL을 쉽게 쓸 수 있다.
- 환경변수와 도메인 연결이 쉽다.

주의:

- 서버리스 환경이므로 로컬 파일 DB를 운영 DB로 쓰지 않는다.
- 서버의 로컬 폴더에 첨부파일을 저장하지 않는다.
- 운영 DB 마이그레이션은 `prisma migrate deploy` 방식으로 실행한다.

### 일반 Node.js 서버

장점:

- 자체 서버와 DB를 한 곳에서 통제할 수 있다.
- 파일 백업 위치를 직접 통제하기 쉽다.

주의:

- 서버 관리, 보안 업데이트, 백업, 장애 대응을 직접 챙겨야 한다.
- 외부 접속 도메인과 HTTPS 설정도 직접 준비해야 한다.

## 환경변수

현재 앱에서 바로 쓰는 값:

| 이름 | 필수 | 설명 |
| --- | --- | --- |
| `DATABASE_URL` | 예 | PostgreSQL 연결 URL. Vercel/Neon/Supabase 등에서 발급 |
| `DIRECT_URL` | 선택 | provider가 pooled URL과 direct URL을 따로 줄 때 Prisma migration용으로 사용 |
| `AUTH_SECRET` | 예 | 세션 서명용 비밀키. 운영에서는 긴 랜덤 문자열을 사용 |
| `ATTACHMENT_STORAGE_DRIVER` | 예 | 개발은 `local`, 운영 권장은 `supabase-storage`. `vercel-blob`도 지원 |
| `SUPABASE_URL` | 선택 | Supabase Storage 서버 접근 URL. 없으면 `NEXT_PUBLIC_SUPABASE_URL`을 사용 |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Storage 사용 시 예 | Supabase 프로젝트 URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Storage 사용 시 예 | 서버에서 private bucket 파일을 업로드/다운로드/삭제할 때 사용. 브라우저에 노출 금지 |
| `SUPABASE_STORAGE_BUCKET` | Supabase Storage 사용 시 예 | 첨부파일을 저장할 Supabase Storage bucket 이름 |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob 사용 시 예 | Vercel Blob 사용 시 첨부파일 업로드/다운로드에 필요 |
| `INITIAL_ADMIN_EMAIL` | 예정 | 운영 초기 관리자 생성 절차에서 사용할 이메일 |
| `INITIAL_ADMIN_PASSWORD` | 예정 | 운영 초기 관리자 생성 절차에서 사용할 임시 비밀번호 |

운영 환경변수 점검:

```bash
npm run deploy:check
```

로컬 `.env`에 placeholder PostgreSQL URL이 들어 있으면 이 명령이 실패하는 것이 정상이다. Vercel 환경변수 또는 실제 운영용 `.env.production` 기준으로 확인한다.

운영에서 주의할 점:

- `.env` 파일은 저장소에 커밋하지 않는다.
- Vercel에서는 Project Settings의 Environment Variables에 값을 등록한다.
- `AUTH_SECRET`은 유출되면 모든 세션 보안이 흔들리므로 재사용하지 않는다.

## 배포 전 검증

배포 전에 로컬 또는 CI에서 아래 명령을 통과시킨다.

```bash
npm run verify
```

개별 실행이 필요하면 아래 순서로 확인한다.

```bash
npm run test
npm run lint
npm run build
```

## DB 마이그레이션 절차

개발 환경:

```bash
npm run db:migrate
```

운영 환경:

```bash
npm run db:deploy
```

운영에서는 `prisma migrate dev`를 쓰지 않는다. `migrate dev`는 개발 중 새 마이그레이션을 만들 때 쓰는 명령이고, 운영에는 이미 만들어진 마이그레이션만 적용해야 한다.

현재 PostgreSQL migration 경로는 `prisma/migrations-postgresql`이다. 기존 `prisma/migrations` 폴더는 SQLite 개발 시절 migration 기록으로 보존되어 있고, Prisma config에서는 사용하지 않는다.

## 첨부파일 저장소

개발 기본값은 로컬 `uploads/attachments` 폴더다.

```bash
ATTACHMENT_STORAGE_DRIVER=local
```

운영 권장값은 Supabase Storage다. Supabase Dashboard의 Storage에서 private bucket을 만들고, 환경변수를 아래처럼 둔다.

```bash
ATTACHMENT_STORAGE_DRIVER=supabase-storage
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
SUPABASE_STORAGE_BUCKET=approval-attachments
```

Vercel Blob을 계속 쓰고 싶다면 Vercel Storage에서 Blob store를 만들고, 환경변수를 아래처럼 둔다.

```bash
ATTACHMENT_STORAGE_DRIVER=vercel-blob
BLOB_READ_WRITE_TOKEN=...
```

새로 업로드되는 첨부파일은 각 파일의 `storageProvider` 값과 함께 저장된다. 따라서 기존 로컬 첨부와 운영 Blob 첨부를 구분해서 다운로드할 수 있다.

주의할 점:

- 현재 구현은 서버 액션으로 파일을 받은 뒤 설정된 저장소에 올린다.
- Supabase Storage 사용 시 bucket은 private으로 두고, 다운로드는 앱 서버의 권한 검사를 거쳐 제공한다.
- `SUPABASE_SERVICE_ROLE_KEY`는 강한 권한을 가진 서버 전용 키라서 클라이언트 코드나 브라우저 환경변수에 넣지 않는다.
- Vercel Functions의 요청 본문 제한 때문에 운영에서는 관리자 첨부 정책의 파일당 최대 크기를 4MB 이하로 두는 것을 권장한다.
- 4MB보다 큰 파일을 운영에서 안정적으로 받으려면 다음 단계에서 브라우저 직접 업로드 방식으로 바꾼다.

## 초기 관리자 계정

개발 환경에서는 seed 데이터가 테스트 계정을 만든다.

운영 환경에서는 데모 문서와 테스트 계정을 그대로 넣지 않는다. 운영 초기 관리자는 스크립트로 만든다.

```bash
INITIAL_ADMIN_EMAIL="admin@example.com" \
INITIAL_ADMIN_PASSWORD="change-this-long-password" \
INITIAL_ADMIN_NAME="운영 관리자" \
npm run admin:create
```

Windows PowerShell에서는 아래처럼 실행한다.

```powershell
$env:INITIAL_ADMIN_EMAIL="admin@example.com"
$env:INITIAL_ADMIN_PASSWORD="change-this-long-password"
$env:INITIAL_ADMIN_NAME="운영 관리자"
npm run admin:create
```

이 스크립트는 `법인` 부서와 `이사` 직급을 보장한 뒤, 같은 이메일 사용자가 있으면 관리자 권한과 비밀번호를 갱신하고 없으면 새로 만든다.

운영 관리자 초기값 기준:

- 이메일: 배포 전에 실제 관리자 이메일로 결정
- 임시 비밀번호: 배포 직전에 생성하고 별도 채널로 전달
- 첫 로그인 후 비밀번호 변경 기능은 추후 구현 필요

## 로그와 감사

업무 감사:

- 결재 요청, 승인, 반려, 관리자 변경은 `AuditLog`에 남긴다.
- 문서 상세의 감사 이력에서 확인한다.

시스템 로그:

- Vercel 배포 시 Vercel Runtime Logs를 1차 확인 위치로 둔다.
- 장애 대응을 강화하려면 Sentry 같은 외부 오류 수집 도구를 추후 연결한다.

## 백업 정책

운영 최소 기준:

- DB: 매일 자동 백업
- 첨부파일 저장소: 매일 또는 스토리지 버전 관리로 보호
- 보관 기간: 최소 30일, 가능하면 월 단위 백업 6개월 이상
- 복구 점검: 월 1회 샘플 복구 테스트

Vercel/Supabase PostgreSQL/Supabase Storage 조합으로 갈 경우:

- Supabase PostgreSQL의 자동 백업 기능을 켠다.
- Supabase Storage bucket의 삭제 보호 또는 버전 관리 대안을 검토한다.
- DB와 첨부파일은 같은 시점 기준으로 복구할 수 있어야 한다.

## Vercel 전환 작업 목록

1. Supabase에서 PostgreSQL DB와 Storage private bucket을 준비한다.
2. `DATABASE_URL`과 필요 시 `DIRECT_URL`을 Vercel 환경변수에 등록한다.
3. Vercel 환경변수에 `AUTH_SECRET`을 등록한다.
4. Storage 환경변수 `ATTACHMENT_STORAGE_DRIVER=supabase-storage`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET`을 등록한다.
5. 필요 시 `NEXT_PUBLIC_SUPABASE_URL` 또는 `SUPABASE_URL`을 등록한다.
6. `npm run admin:create`로 운영 초기 관리자를 만든다.
7. Vercel 배포 후 `npm run db:deploy`가 적용되는지 확인한다.

## 아직 배포 불가인 이유

현재 앱은 코드 기준으로 PostgreSQL과 Vercel Blob 전환이 끝났다. Vercel 운영 배포에는 아래 작업이 남아 있다.

- 실제 PostgreSQL 생성 및 `DATABASE_URL` 등록
- 운영 초기 관리자 계정 실제 생성

이 두 가지가 끝나면 Vercel 배포 절차로 넘어갈 수 있다.
