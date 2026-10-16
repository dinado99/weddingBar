// Supabase 연결 정보.
// Supabase 대시보드 → Project Settings → API 에서 Project URL 과 anon public 키를 복사해 넣는다.
// anon 키는 공개해도 되는 키다. (데이터는 supabase/schema.sql 의 권한 규칙이 지킨다)
// 둘 다 비워 두면 서버 없이 이 브라우저에만 저장하는 연습 모드로 동작한다.
window.PIXEL_BAR_CONFIG = {
  supabaseUrl: 'https://vxjyzpkgavyoyaaxqgtv.supabase.co',
  supabaseAnonKey: 'sb_publishable_XfpP3dfqfCegdXKCtzsTPA_B64IpzFU',
  // true면 "체험용이니 실제 정보 대신 예시를 넣어 달라"는 안내를 보여 준다 (사내 체험용)
  trialMode: true,
  // 카카오톡 공유 버튼용 JavaScript 키 (developers.kakao.com → 내 애플리케이션 → 앱 키).
  // 공개해도 되는 키다. 비워 두면 공유 버튼이 숨겨진다.
  kakaoJsKey: '',
};
