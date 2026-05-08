# PostgreSQL 전환 기록

이 문서는 SQLite 개발 DB에서 PostgreSQL 운영 DB로 전환한 내용을 정리한다.

## 현재 상태

현재 앱은 아래 구성을 사용한다.

- Prisma datasource provider: `postgresql`
- Prisma runtime adapter: `@prisma/adapter-pg`
- DB URL: `DATABASE_URL`
- migration 경로: `prisma/migrations-postgresql`
- 운영 배포 후보: Vercel

기존 SQLite migration은 `prisma/migrations`에 보존되어 있지만 Prisma config에서는 사용하지 않는다.

## 왜 바로 provider만 바꾸면 안 되는가

현재 `prisma/migrations` 안의 SQL은 SQLite 기준으로 만들어져 있다. 예를 들어 `PRAGMA`, `DATETIME`, SQLite 테이블 재정의 방식이 들어간다.

PostgreSQL로 바꾸려면 아래가 함께 바뀌어야 한다.

- `prisma/schema.prisma` datasource provider
- Prisma runtime adapter
- DB migration SQL
- 운영 `DATABASE_URL`
- 배포 시 migration 실행 절차

따라서 기존 SQLite migration을 그대로 PostgreSQL에 `migrate deploy`하면 안 된다.

## 전환된 내용

1. `prisma/schema.prisma`의 datasource provider를 `postgresql`로 변경했다.
2. `src/lib/prisma.ts`와 `prisma/seed.ts`를 `@prisma/adapter-pg` 기반으로 변경했다.
3. PostgreSQL 기준 초기 migration을 `prisma/migrations-postgresql`에 만들었다.
4. `prisma.config.ts`는 `DIRECT_URL`이 있으면 migration에 우선 사용하고, 없으면 `DATABASE_URL`을 사용한다.
5. `.env.example`과 배포 문서를 PostgreSQL 기준으로 갱신했다.

## 필요한 패키지

PostgreSQL TCP 연결 기준:

```bash
npm install pg @prisma/adapter-pg
npm install -D @types/pg
```

Vercel/Neon 같은 serverless PostgreSQL을 쓸 경우에는 연결 방식에 따라 serverless adapter를 검토한다.

## 현재 코드 기준

`prisma/schema.prisma`:

```prisma
datasource db {
  provider = "postgresql"
}
```

`prisma.config.ts`:

```ts
datasource: {
  url: process.env["DIRECT_URL"] ?? env("DATABASE_URL"),
}
```

`src/lib/prisma.ts`는 SQLite adapter 대신 PostgreSQL adapter를 사용한다.

## migration 기준

새 운영 PostgreSQL DB가 비어 있다면 아래 명령으로 PostgreSQL 기준 initial migration을 적용한다.

```bash
npm run db:deploy
```

중요:

- SQLite migration SQL을 PostgreSQL에 그대로 적용하지 않는다.
- 운영에서는 `npm run db:migrate`가 아니라 `npm run db:deploy`를 쓴다.
- 기존 SQLite 개발 DB 데이터를 운영으로 옮길지는 별도 데이터 이전 작업으로 다룬다.

## 전환 전 체크

현재 추가된 점검 명령:

```bash
npm run deploy:check
```

이 명령은 운영 환경에서 최소한 아래를 확인한다.

- `DATABASE_URL`이 PostgreSQL URL인지
- `AUTH_SECRET`이 충분히 길고 placeholder가 아닌지
- 첨부파일 저장소 드라이버와 토큰, 초기 관리자 값 준비 상태

로컬 `.env`가 placeholder PostgreSQL URL이면 `deploy:check`가 실패하는 것이 정상이다. 이 명령은 실제 운영 환경변수 기준으로 실행한다.

## 남은 결정

- PostgreSQL 제공자: Vercel Postgres, Neon, Supabase 등
- 첨부파일 저장소: Vercel Blob 환경변수 등록 여부
- 기존 개발 데이터 이전 여부
- 운영 초기 관리자 계정 이메일
