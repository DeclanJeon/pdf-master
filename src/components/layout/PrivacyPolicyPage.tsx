const updatedAt = '2026-06-02'

const sections = [
  {
    title: '1. 수집하는 개인정보 항목',
    body: [
      'PDF마스터는 회원가입을 별도로 받지 않으며, 로그인은 Google OAuth를 통해 처리합니다.',
      'Google 로그인 시 서비스 운영을 위해 Google 계정 식별자, 이메일 주소, 표시 이름, 프로필 이미지 URL을 받을 수 있습니다.',
      '무료 사용량 제한, 보안, 부정 이용 방지를 위해 접속 IP 주소, 세션 쿠키, 사용량 기록을 처리할 수 있습니다.',
      '결제 기능 이용 시 결제 처리사 Polar.sh를 통해 결제자 이메일, 상품/구독 상태, 결제 이벤트 식별자, 결제 처리에 필요한 IP 정보가 처리될 수 있습니다.',
      'HWP 변환, PDF 압축, 암호 설정/해제 등 서버 처리가 필요한 기능에서는 사용자가 업로드한 문서 파일과 변환 결과 파일을 임시로 처리합니다.',
    ],
  },
  {
    title: '2. 개인정보의 이용 목적',
    body: [
      'Google 로그인 계정 확인, 세션 유지, 유료 이용권/구독 상태 확인',
      '무료 사용량 제한 적용 및 서비스 남용 방지',
      '파일 변환, 압축, 암호 처리 등 사용자가 요청한 PDF/HWP 기능 제공',
      '결제 처리, 이용권 부여, 환불 및 고객 문의 대응',
      '서비스 안정성 확보, 장애 분석, 보안 사고 예방',
    ],
  },
  {
    title: '3. 파일 처리와 보관 기간',
    body: [
      '주민번호 마스킹, 도장/서명 이미지 삽입, PDF 병합/분할 등 브라우저에서 가능한 기능은 원칙적으로 사용자의 브라우저 안에서 처리됩니다.',
      'HWP 변환, PDF 압축, 암호 설정/해제 등 서버 처리가 필요한 기능은 파일을 서버에 임시 업로드하여 처리합니다.',
      '서버 처리 파일과 결과 파일은 다운로드 제공 및 오류 대응을 위한 짧은 시간 동안만 임시 보관되며, 현재 기준 10분 이내 자동 삭제되도록 운영합니다.',
      '사용자가 업로드한 문서 내용은 광고, 학습, 별도 분석 목적으로 사용하지 않습니다.',
    ],
  },
  {
    title: '4. 개인정보의 보관 기간',
    body: [
      '세션 정보는 로그인 유지 기간 동안 보관되며, 로그아웃 또는 만료 시 삭제됩니다.',
      '유료 이용권/구독 상태와 결제 이벤트 기록은 서비스 제공, 정산, 환불, 분쟁 대응을 위해 필요한 기간 동안 보관합니다.',
      '무료 사용량 기록은 일 단위 이용 제한과 부정 이용 방지를 위해 필요한 기간 동안 보관할 수 있습니다.',
      '관리자 처리 이력은 권한 부여/회수 등 운영 감사 목적으로 필요한 기간 동안 보관할 수 있습니다.',
    ],
  },
  {
    title: '5. 제3자 제공 및 처리 위탁',
    body: [
      'Google: Google OAuth 로그인과 계정 정보 확인을 위해 사용됩니다.',
      'Polar.sh: 결제, 구독, 환불, 결제 이벤트 처리를 위해 사용됩니다.',
      'PDF마스터는 법령에 근거가 있거나 사용자가 동의한 경우를 제외하고 개인정보를 제3자에게 판매하거나 임의 제공하지 않습니다.',
    ],
  },
  {
    title: '6. 쿠키 사용',
    body: [
      '로그인 세션 유지를 위해 httpOnly, SameSite 속성이 적용된 세션 쿠키를 사용합니다.',
      '운영 환경에서는 HTTPS 전송을 전제로 Secure 쿠키 설정을 사용합니다.',
      '세션 쿠키는 브라우저 JavaScript에서 직접 읽을 수 없도록 설정됩니다.',
    ],
  },
  {
    title: '7. 이용자의 권리',
    body: [
      '이용자는 본인의 개인정보 열람, 정정, 삭제, 처리 정지를 요청할 수 있습니다.',
      'Google 계정 정보는 Google 계정 설정에서도 관리할 수 있습니다.',
      '서비스 계정/결제 정보 삭제 또는 개인정보 문의는 아래 문의처로 요청할 수 있습니다.',
    ],
  },
  {
    title: '8. 안전성 확보 조치',
    body: [
      '로그인 세션은 서명된 httpOnly 쿠키로 관리합니다.',
      '서버 처리 파일은 임시 디렉터리에서 처리하고 짧은 보관 시간 후 삭제합니다.',
      '관리자 기능은 관리자 계정에 한해 접근하도록 제한합니다.',
      '결제 webhook은 서명 검증 및 중복 처리 방지를 적용합니다.',
    ],
  },
  {
    title: '9. 문의처',
    body: [
      '개인정보, 환불, 서비스 이용 관련 문의: refund@pdfm.ponslink.com',
      '문의 시 본인 확인과 처리 이력 확인을 위해 Google 로그인 이메일 또는 결제 이메일을 요청할 수 있습니다.',
    ],
  },
]

export function PrivacyPolicyPage() {
  return (
    <div className="bg-white">
      <section className="border-b bg-gradient-to-br from-red-50 via-white to-red-50 py-12">
        <div className="container mx-auto max-w-4xl px-4">
          <p className="text-sm font-medium text-red-600">PDF마스터</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">개인정보처리방침</h1>
          <p className="mt-4 text-muted-foreground">
            PDF마스터는 필요한 최소한의 정보만 처리하고, 문서 파일은 기능 제공을 위한 임시 처리에 한정합니다.
          </p>
          <p className="mt-2 text-sm text-muted-foreground">시행일 및 최종 업데이트: {updatedAt}</p>
        </div>
      </section>

      <section className="container mx-auto max-w-4xl px-4 py-10">
        <div className="rounded-xl border bg-red-50 p-5 text-sm text-red-900">
          <strong>요약:</strong> 별도 회원가입 정보는 받지 않습니다. 다만 Google 로그인 시 이메일·이름·프로필 이미지 등 Google 계정 정보,
          무료 사용량 제한을 위한 IP/사용량 기록, 결제 처리를 위한 결제 이메일/이벤트 정보, 서버 변환을 위한 임시 문서 파일을 처리할 수 있습니다.
        </div>

        <div className="mt-8 space-y-8">
          {sections.map((section) => (
            <section key={section.title} className="space-y-3">
              <h2 className="text-xl font-semibold">{section.title}</h2>
              <ul className="list-disc space-y-2 pl-5 text-sm leading-6 text-muted-foreground">
                {section.body.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </section>
    </div>
  )
}
