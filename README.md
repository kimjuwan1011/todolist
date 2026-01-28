# 오늘의 할 일 (To‑Do Calendar)

캘린더에서 날짜를 선택하고, **선택한 날짜별로 할 일(To‑Do)을 추가/완료/삭제**할 수 있는 정적 웹앱입니다.  
프론트는 **HTML/CSS/Vanilla JS**, 저장소는 **Firebase Firestore**를 사용합니다. (로그인 없음 → 공용 데이터)

## 주요 기능 (MVP)

- 월 단위 캘린더 표시
- 오늘 날짜 하이라이트, 날짜 선택 표시
- 할 일이 있는 날짜에 점(dot) 표시
- 날짜별 할 일
  - 추가
  - 완료/미완료 체크
  - 삭제
- Firestore에 저장되어 새로고침 후에도 유지

## 폴더/파일 구조

```
todolist/
  index.html
  styles.css
  app.js
  firebase.js
  firestore.rules
```

## 실행 방법

정적 파일이므로 **로컬 서버로 실행**하는 것을 권장합니다.

### 방법 A) Live Server (추천)

1. VSCode/Cursor에서 Live Server 확장 설치
2. `todolist/index.html` 우클릭 → **Open with Live Server**

### 방법 B) Node로 간단 서버

Node가 설치되어 있다면:

```bash
npx serve .
```

그 다음 터미널에 표시되는 주소로 접속합니다.

## Firebase(Firestore) 연결 방법

### 1) Firebase 프로젝트 생성 + Firestore 활성화

1. Firebase 콘솔에서 프로젝트 생성
2. Firestore Database 생성(네이티브 모드)

### 2) 웹 앱 추가 후 설정값 넣기

Firebase 콘솔 → 프로젝트 설정 → **내 앱(웹)** → Firebase SDK snippet의 config를 복사해서  
`todolist/firebase.js`에 붙여넣고 `firebaseConfig = null`을 실제 객체로 바꾸세요.

`firebase.js` 예시:

```js
export const firebaseConfig = {
  apiKey: "...",
  authDomain: "...",
  projectId: "...",
  storageBucket: "...",
  messagingSenderId: "...",
  appId: "...",
};
```

### 3) Firestore 보안 규칙(연습용)

현재 앱은 **로그인 없이 공용 데이터**를 전제로 하므로, 연습 단계에서는 아래처럼 열어둘 수 있습니다.
`todolist/firestore.rules`에도 동일한 예시가 들어있습니다.

```js
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /todos/{dateId} {
      allow read, write: if dateId.matches('^[0-9]{4}-[0-9]{2}-[0-9]{2}$');
    }
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

1) Firebase 콘솔 → Firestore Database → **Rules** 탭에 붙여넣기  
2) **Publish** 버튼 누르기 (이걸 안 누르면 계속 `permission-denied`가 뜹니다)

> 주의: 위 규칙은 **로그인 없이 공용으로 읽기/쓰기**가 가능하므로 연습용입니다. 공개 배포 시에는 인증/권한(예: 익명 로그인) 추가가 필요합니다.

## Firestore 데이터 구조

컬렉션/문서 구조(로그인 없이 공용):

```
todos (collection)
 └ yyyy-mm-dd (document)
    ├ items: [
    │   { id: string, text: string, completed: boolean, createdAt: number }
    │ ]
    └ updatedAt: timestamp
```

## 자주 겪는 문제

- **아무 것도 저장/불러오기 안 됨**
  - `firebase.js`의 `firebaseConfig`가 `null`이면 Firebase 기능이 비활성화됩니다.
  - Firestore 규칙이 너무 엄격하면 읽기/쓰기가 실패합니다.
- **파일 더블클릭으로 열었더니 동작이 이상함**
  - 브라우저 보안 정책 때문에 모듈 로딩이 막힐 수 있어 로컬 서버 실행을 권장합니다.

## 다음 확장 아이디어

- 할 일 수정(편집)
- 중요 표시(⭐)
- 월/주 통계
- 다크 모드(토글)
- 인증 추가(익명 로그인) + 사용자별 데이터 분리

