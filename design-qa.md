# 채팅 첨부 카드 레이아웃 검수 — 2026-10-06

파일 단독 메시지의 첨부 카드가 줄어들어 파일명이 사라지고 파일 작업 버튼이 시간과 겹치는 모바일 문제를 수정했다. 첨부 말풍선의 폭을 확정하고 파일명 행의 자동 기준 폭을 유지한다.

[전체 검수 보고서](docs/design/chat-attachment-native-layout/design-qa.md), [전후 웹 비교](docs/design/chat-attachment-native-layout/before-after-web-390.png), [측정 결과](docs/design/chat-attachment-native-layout/qa-result.json).

실제 React Native Yoga 엔진으로 240개 경계 조합을 통과했고 수정 전 소스에서 폭 축소 회귀를 재현했다. 관련 채팅 회귀 검사 71개, 루트/모바일 린트·타입 검사, 운영 설정과 Android/iOS/web export를 통과했다. 웹의 360/390/1366px, 라이트·다크, 200% 확대에서 첨부 파일명·버튼·시간이 겹치지 않는다. 사용자 제공 실기기 사진이나 실제 대화는 저장소에 포함하지 않았다.

텍스트 측정은 합성 모델이며 물리 기기 폰트·Safe Area·스크린리더·OTA 적용 후 화면은 직접 확인하지 않았다. 검수 이미지와 API는 합성 자료다.
