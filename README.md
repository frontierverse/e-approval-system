# 결재온

사내전자결재 웹서비스 프로젝트다. 모바일앱은 만들지 않고, 웹 화면으로만 제공한다.

## 문서

- [개발 계획서](./docs/e-approval-todo.md)
- [프로젝트 기준](./docs/project-brief.md)
- [데이터 모델 설계](./docs/data-model.md)
- [배포 준비](./docs/deployment.md)
- [PostgreSQL 전환 기록](./docs/postgresql-transition.md)

## 현재 기준

- 제품명: 결재온
- 제공 형태: 웹서비스 전용
- 사용자 역할: 일반 사용자, 결재자, 관리자
- MVP 문서 양식: 일반 기안서
- 문서 상태: 임시저장, 결재 요청, 진행중, 승인완료, 반려, 회수
- 결재 액션: 임시저장, 결재 요청, 승인, 반려, 회수

## 개발 실행

```bash
npm run dev
```

브라우저에서 `http://127.0.0.1:3000` 또는 `http://localhost:3000`으로 확인한다.

## 테스트 계정

공통 비밀번호는 `password123`이다.

- 관리자: `minjun.kim@company.local`
- 일반 사용자: `seoyeon.lee@company.local`

## 검증

```bash
npm run verify
```

개별 확인이 필요하면 아래 명령을 사용한다.

```bash
npm run test
npm run lint
npm run build
```

운영 환경변수 점검은 아래 명령을 사용한다.

```bash
npm run deploy:check
```

운영 초기 관리자 계정은 아래 명령으로 만든다.

```bash
npm run admin:create
```

## DB

DB는 PostgreSQL과 Prisma를 사용한다. 실제 개발/운영 DB URL을 `.env`의 `DATABASE_URL`에 넣어야 한다.

```bash
npm run db:migrate
npm run db:deploy
npm run db:seed
npm run db:studio
```

`db:deploy`는 운영 환경에서 이미 만들어진 migration을 적용할 때 사용한다.

## 첨부파일 저장소

개발 기본값은 로컬 저장소다.

```bash
ATTACHMENT_STORAGE_DRIVER=local
```

운영 권장값은 Supabase Storage다.

```bash
ATTACHMENT_STORAGE_DRIVER=supabase-storage
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
SUPABASE_STORAGE_BUCKET=approval-attachments
```

Vercel Blob도 계속 지원한다.
