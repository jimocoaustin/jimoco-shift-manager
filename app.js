/* Jimoco Shift Standalone */
(function () {
  'use strict';

  var cfg = window.JIMOCO_CONFIG || {};
  var supabase = null;
  var employees = [];
  var _mr = sessionStorage.getItem('jimoco_mgr');
  var managerRole = (_mr === 'manager') ? 'manager' : 'owner'; /* '1'은 구버전 오너 세션 */
  var managerAuthed = (_mr === '1' || _mr === 'owner' || _mr === 'manager');
  var currentShiftEmp = null;
  var mgrToken = sessionStorage.getItem('jimoco_mgr_token') || null; /* 매니저 세션 토큰 (RPC 인증) */
  var allEmployees = []; /* 승인 대기 포함 전체 직원 (관리자 세션에서만 채워짐) */
  var verifiedPin = null; /* PIN 게이트를 통과한 직원 PIN (기록·본인 정보 조회용) */
  var ipCache = null;
  var payrollCache = { shifts: [], closeouts: [], start: '', end: '', computed: null };
  var tipTotalCents = null, tipAppCents = 0; /* null = 서버 팁 합계 기본값 */
  var tipServer1Id = null, tipServer2Id = null, tipShowServer2 = false;
  var payrollRoleFilter = 'all';
  var showBonusDetail = true;
  var lang = 'ko';

  /* 마감 정산: 권종 정의 (id, DB 컬럼, 센트 가치) */
  var DENOMS = [
    { id: 'coC100', key: 'count_100', cents: 10000 },
    { id: 'coC50',  key: 'count_50',  cents: 5000 },
    { id: 'coC20',  key: 'count_20',  cents: 2000 },
    { id: 'coC10',  key: 'count_10',  cents: 1000 },
    { id: 'coC5',   key: 'count_5',   cents: 500 },
    { id: 'coC2',   key: 'count_2',   cents: 200 },
    { id: 'coC1',   key: 'count_1',   cents: 100 },
    { id: 'coC25',  key: 'count_25c', cents: 25 }
  ];
  var coPrevCounted = 0;
  var closeoutCache = { rows: [], month: '' };
  var todayCoCache = { rows: [] };
  var coReturnToToday = false;

  var $ = function (id) { return document.getElementById(id); };

  /* ---------- 다국어 (KO/EN) ---------- */
  var I18N = {
    ko: {
      appTitle: 'Jimoco 직원 관리',
      lockTitle: 'Jimoco 직원 관리',
      lockDesc: '비밀번호를 입력하세요.',
      lockPh: '비밀번호',
      unlock: '확인',
      headerTitle: '직원 관리',
      admin: '관리자',
      clockDesc: '이름을 눌러 출퇴근 시간을 입력하세요.',
      servers: '서버',
      kitchen: '주방',
      tabPayroll: '급여',
      tabEmployees: '직원 관리',
      tabPin: '비밀번호 관리',
      logout: '로그아웃',
      thisWeek: '이번 주',
      thisMonth: '이번 달',
      lastMonth: '지난달',
      load: '조회',
      exportCsv: 'CSV 내보내기',
      filterAll: '전체',
      shiftRecords: '근무 기록',
      wageSection: '월급',
      tipSection: '팁',
      openEmpModal: '직원 관리 열기',
      empTabDesc: '큰 창에서 직원을 추가·수정합니다.',
      mgrPwTitle: '오너 비밀번호',
      mgrAcctTitle: '관리자 권한 계정',
      mgrUserPh: '새 아이디',
      newPwPh: '비밀번호 (4자 이상)',
      mgrPwPh: '비밀번호 (8자+, 대문자+특수문자)',
      mgrPwRule: '비밀번호는 8자 이상이며 대문자와 특수문자를 포함해야 합니다.',
      show: '보기',
      hide: '숨기기',
      signup: '회원가입',
      findPw: '비밀번호 찾기',
      suTitle: '관리자 권한 회원가입',
      signupDesc: '가입 신청 후 오너 승인 시 로그인할 수 있습니다.',
      email: '이메일',
      confirmPw: '비밀번호 확인',
      pwRuleGuide: '비밀번호는 8자 이상, 대문자와 특수문자를 포함해야 합니다. (예: Jimoco!2026)',
      signupApply: '가입 신청',
      resetTitle: '비밀번호 찾기',
      sendCode: '코드 받기',
      codeSent: '이메일로 코드를 보냈습니다. (최대 5분 소요)',
      code: '인증 코드',
      changePw: '비밀번호 변경',
      pendingTitle: '승인 대기',
      approve: '승인',
      reject: '거절',
      approved: '승인되었습니다.',
      mgrEmailPh: '이메일',
      mgrPwEditPh: '새 비번 (변경 시만 입력)',
      needEmail: '이메일을 입력해주세요.',
      badEmail: '올바른 이메일 형식이 아닙니다.',
      pwMismatch: '비밀번호가 일치하지 않습니다.',
      dupUser: '이미 사용 중인 아이디입니다.',
      signupPending: '가입 신청 완료! 오너 승인 후 로그인할 수 있습니다.',
      noAccount: '등록되지 않은 아이디입니다.',
      noEmail: '등록된 이메일이 없습니다. 오너에게 문의하세요.',
      codeFail: '코드가 올바르지 않거나 만료되었습니다.',
      resetDone: '비밀번호가 변경되었습니다. 로그인해주세요.',
      pendingLogin: '아직 승인 대기 중입니다. 오너에게 문의하세요.',
      newEmpReg: '새 직원 등록',
      empRegTitle: '새 직원 등록',
      empRegDesc: '정보를 입력하면 오너 승인 후 출근 등록이 가능합니다.',
      empNamePh: '이름',
      empPhonePh: '전화번호',
      regPinPh: 'PIN 4~8자리 숫자 (출근용)',
      empRegBtn: '등록 신청',
      empRegDone: '등록 신청 완료! 오너 승인 후 출근할 수 있습니다.',
      needPhone: '전화번호를 입력해주세요.',
      empPendingTitle: '승인 대기 중인 직원',
      empApproveTitle: '승인: ',
      empApprove: '승인하고 저장',
      tipServer1: '서버 1',
      tipServer2: '서버 2',
      tipAddServer: '+ 다른 서버 추가',
      noPendingEmp: '대기 중인 직원이 없습니다.',
      needUsername: '아이디를 입력하세요.',
      mgrUserExists: '이미 있는 아이디입니다.',
      confirmDelMgr: '이 관리자 권한 계정을 삭제할까요?',
      noManagers: '등록된 관리자 권한 계정이 없습니다.',
      confirmDelCo: '이 마감 정산 기록을 삭제할까요?',
      loginUser: '아이디',
      ownerUser: '아이디',
      staffPinTitle: '직원 PIN',
      curVal: '현재 비밀번호',
      curPw: '현재 비밀번호',
      newPw: '새 비밀번호 (4자 이상)',
      newPw2: '새 비밀번호 확인',
      change: '변경',
      add: '추가',
      screenPwTitle: '출근 화면 비밀번호',
      curScreenPw: '현재 출근 화면 비밀번호',
      workDate: '근무 날짜',
      clockIn: '출근 시간',
      clockOut: '퇴근 시간',
      tips: '팁 ($)',
      boosterCheck: '부스터 보너스 (임금의 10%)',
      fulltimeCheck: '풀타임 근무 (부스터는 저녁 시간만)',
      fulltimeShort: '풀타임',
      eveningStart: '저녁 쉬프트 시작 시간',
      masterPinTitle: '마스터 PIN (오너 전용)',
      masterPinDesc: '모든 직원의 기록·수정을 열 수 있는 오너 전용 번호입니다.',
      masterPinNew: '새 마스터 PIN (4~8자리 숫자)',
      eveOrder: '저녁 시작 시간은 출근과 퇴근 사이여야 합니다.',
      holidayCheck: '홀리데이 보너스 (임금의 50%)',
      tipsPh: '서버만 입력',
      timePh: '14:00',
      save: '저장',
      cancel: '취소',
      loginTitle: '관리자 로그인',
      password: '비밀번호',
      empModalTitle: '직원 관리',
      empFormNew: '새 직원 추가',
      empFormEdit: '직원 수정: ',
      empName: '직원 이름 *',
      role: '역할',
      roleServer: '서버',
      roleKitchen: '주방',
      hourlyRate: '시급 ($)',
      ratePh: '예: 19.00',
      empPin: '직원 PIN (4~8자리, 출근용)',
      empPinPh: '비워두면 미설정',
      email: '이메일',
      phone: '연락처',
      address: '주소',
      sin: 'SIN 번호',
      birthday: '생일',
      firstShift: '첫 출근일',
      clear: '새로 입력',
      del: '삭제',
      edit: '수정',
      empListTitle: '등록된 직원',
      empListDesc: '직원을 눌러 정보를 크게 열고 수정하세요.',
      empInfoTitle: '직원 정보 목록',
      empInfoDesc: '오너만 볼 수 있는 전체 직원 정보입니다.',
      empCsvBtn: 'CSV로 내보내기',
      calStat: '스탯 홀리데이 1.5배',
      editShiftTitle: '근무 기록 수정',
      wrongPw: '비밀번호가 틀렸습니다.',
      fail3: '3회 실패했습니다. 관리자에게 알림이 전송됩니다.',
      toastEmpFail: '직원 목록을 불러오지 못했습니다.',
      toastPayrollFail: '급여 데이터를 불러오지 못했습니다.',
      toastPickPeriod: '기간을 선택하세요.',
      toastNoCsv: '내보낼 데이터가 없습니다.',
      toastSaved: '저장됐습니다.',
      toastDeleted: '삭제됐습니다.',
      needAll: '날짜, 출근, 퇴근 시간을 모두 입력하세요.',
      badTime: '시간은 24시간 형식(HH:MM)으로 입력하세요. 예: 14:00',
      futureTime: '현재 시각보다 늦은 시간은 입력할 수 없습니다.',
      saveFail: '저장 실패: ',
      needName: '직원 이름은 필수입니다.',
      badPin: '직원 PIN은 4~8자리 숫자입니다.',
      staffEditTitle: '내 정보 수정',
  histBtn: '기록',
  histTitle: '내 근무 기록',
  tabCalendar: '달력',
  calTipsTotal: '팁 합계',
  calServerTips: '서버 팁 합계',
  calKitchenTips: '주방 팁 합계',
  calSemiEmp: '직원별 팁 합계',
  calWageTotal: '임금 합계',
  calDailyPay: '일당',
  calNone: '이 날 기록이 없습니다.',
  histTotal: '총 근무시간',
  histDays: '일 근무',
  histNone: '이 기간에 근무 기록이 없습니다.',
      pinForgot: 'PIN을 잊으셨나요?',
      pinSetupTitle: 'PIN 만들기',
      pinSetupNote: '아직 PIN이 없어요. 기록·본인 정보를 보려면 먼저 본인 PIN을 만들어 주세요.',
      sessionExpired: '로그인 세션이 만료됐어요. 다시 로그인해 주세요.',
      loadFail: '불러오지 못했어요.',
      boostMark: '부스터 10%',
      pinResetTitle: 'PIN 찾기',
      pinResetFor: '대상',
      newPin: '새 PIN',
      confirmPin: 'PIN 확인',
      changePin: 'PIN 변경',
      pinWrong: 'PIN이 틀렸습니다.',
      pinChanged: 'PIN이 변경되었습니다.',
      noEmailForPin: '등록된 이메일이 없습니다. 관리자에게 문의하세요.',
      delFail: '삭제 실패: ',
      changeFail: '변경 실패: ',
      curPwWrong: '현재 비밀번호가 틀렸습니다.',
      curScreenPwWrong: '현재 출근 화면 비밀번호가 틀렸습니다.',
      pwShort: '새 비밀번호는 4자 이상이어야 합니다.',
      pwMismatch: '새 비밀번호 확인이 일치하지 않습니다.',
      pwSame: '현재 비밀번호와 다른 값을 입력하세요.',
      pwChanged: '비밀번호가 변경됐습니다.',
      screenPwChanged: '출근 화면 비밀번호가 변경됐습니다.',
      confirmDelEmp: '이 직원을 삭제할까요? 근무 기록도 함께 삭제됩니다.',
      confirmDelShift: '이 근무 기록을 삭제할까요?',
      needInfo: '추가 정보가 필요합니다.',
      none: '없음',
      noShifts: '근무 기록이 없습니다.',
      total: '합계',
      tipPoolTitle: '주방 팁 풀',
      tipPoolTotalTips: '서버 팁 합계 ($)',
      tipPoolAppTips: '배달앱 팁 ($)',
      tipPoolDistributable: '분배 대상',
      poolServerTips: '서버 팁 합계',
      poolKitchenFormula: '주방 팁 (서버팁 ÷7 × 3)',
      poolGrandTotal: '총팁',
      tipPoolServerShare: '서버 70%',
      tipPoolKitchenShare: '주방 30%',
      tipPoolNote: '(주방 근무시간 비율로 배분)',
      thEmployee: '직원',
      thRole: '역할',
      thHours: '시간',
      thRate: '시급',
      thWage: '임금',
      thVacation: '휴가수당',
      thBooster: '부스터',
      thHoliday: '홀리데이',
      thBonus: '보너스',
      bonusHide: '수당 숨기기',
      thTips: '팁',
      thKShare: '주방팁',
      thTotal: '합계',
      csvDateRange: '날짜 범위',
      tipsWord: '팁',
      tabCloseout: '마감 정산',
      coSection: '마감 정산',
      coWorkedHours: '근무 시간',
      coTotalSales: '총매출 ($)',
      coCashSales: '현금 매출 ($) (팁 포함)',
      coTotalTip: '팁 ($) · Total Tip',
      coServerTip: '서버 팁 (70%)',
      coEmp2: '두 번째 서버 (선택)',
      coNone: '없음',
      coEach: '1인당',
      coTillCount: '돈통 세기',
      coCounted: '실제 돈통 금액',
      coExpected: '예상 금액',
      coPrevNote: '전날 돈통',
      coDiff: '차이',
      coMatch: '일치',
      coThDate: '날짜',
      coThTotalSales: '총매출',
      coThCash: '현금매출',
      coThTips: '팁',
      coThCounted: '실제',
      coThExpected: '예상',
      coThDiff: '차이',
      coSummary: '월간 합계',
      coMismatch: '차이 건수',
      coNoData: '정산 기록이 없습니다.',
      todayCo: '오늘의 정산',
      todayCoEmpty: '오늘 입력된 정산이 아직 없습니다.',
      coSaveFail: '마감 정산 저장 실패: ',
      setupTitle: '설정이 필요합니다',
      setupBody: 'config.js 파일에 Supabase URL과 anon key를 입력한 뒤 다시 열어주세요.<br>자세한 순서는 README.md를 참고하세요.'
    },
    en: {
      appTitle: 'Jimoco Staff Manager',
      lockTitle: 'Jimoco Staff Manager',
      lockDesc: 'Enter your password.',
      lockPh: 'Password',
      unlock: 'Unlock',
      headerTitle: 'Staff Manager',
      admin: 'Admin',
      clockDesc: 'Tap a name to enter clock in/out times.',
      servers: 'Servers',
      kitchen: 'Kitchen',
      tabPayroll: 'Payroll',
      tabEmployees: 'Employees',
      tabPin: 'Passwords',
      logout: 'Log out',
      thisWeek: 'This week',
      thisMonth: 'This month',
      lastMonth: 'Last month',
      load: 'Load',
      exportCsv: 'Export CSV',
      filterAll: 'All',
      shiftRecords: 'Shift records',
      wageSection: 'Wages',
      tipSection: 'Tips',
      openEmpModal: 'Open employee management',
      empTabDesc: 'Add or edit employees in the large window.',
      mgrPwTitle: 'Owner password',
      mgrAcctTitle: 'Admin accounts',
      mgrUserPh: 'New username',
      newPwPh: 'Password (4+ characters)',
      mgrPwPh: 'Password (8+, uppercase + symbol)',
      mgrPwRule: 'Password must be at least 8 characters and include an uppercase letter and a special character.',
      show: 'Show',
      hide: 'Hide',
      signup: 'Sign up',
      findPw: 'Forgot password',
      suTitle: 'Admin sign-up',
      signupDesc: 'You can log in after the owner approves your request.',
      email: 'Email',
      confirmPw: 'Confirm password',
      pwRuleGuide: 'Password must be 8+ characters with an uppercase letter and a special character. (e.g. Jimoco!2026)',
      signupApply: 'Request sign-up',
      resetTitle: 'Forgot password',
      sendCode: 'Send code',
      codeSent: 'A code was sent to your email. (up to 5 minutes)',
      code: 'Verification code',
      changePw: 'Change password',
      pendingTitle: 'Pending approval',
      approve: 'Approve',
      reject: 'Reject',
      approved: 'Approved.',
      mgrEmailPh: 'Email',
      mgrPwEditPh: 'New password (only to change)',
      needEmail: 'Enter your email.',
      badEmail: 'Enter a valid email address.',
      pwMismatch: 'Passwords do not match.',
      dupUser: 'Username already in use.',
      signupPending: 'Sign-up requested! You can log in after the owner approves.',
      noAccount: 'Unknown username.',
      noEmail: 'No registered email. Ask the owner.',
      codeFail: 'Code is invalid or expired.',
      resetDone: 'Password changed. Please log in.',
      pendingLogin: 'Still pending approval. Ask the owner.',
      newEmpReg: 'New employee sign-up',
      empRegTitle: 'New employee sign-up',
      empRegDesc: 'After the owner approves, you can clock in.',
      empNamePh: 'Name',
      empPhonePh: 'Phone number',
      regPinPh: 'PIN 4-8 digits (for clock-in)',
      empRegBtn: 'Request registration',
      empRegDone: 'Registration requested! You can clock in after the owner approves.',
      needPhone: 'Enter your phone number.',
      empPendingTitle: 'Employees pending approval',
      empApproveTitle: 'Approve: ',
      empApprove: 'Approve & save',
      tipServer1: 'Server 1',
      tipServer2: 'Server 2',
      tipAddServer: '+ Add another server',
      noPendingEmp: 'No employees pending approval.',
      needUsername: 'Enter a username.',
      mgrUserExists: 'Username already exists.',
      confirmDelMgr: 'Delete this admin account?',
      noManagers: 'No admin accounts yet.',
      confirmDelCo: 'Delete this closeout record?',
      loginUser: 'Username',
      ownerUser: 'Username',
      staffPinTitle: 'Staff PINs',
      curVal: 'Current password',
      curPw: 'Current password',
      newPw: 'New password (4+ characters)',
      newPw2: 'Confirm new password',
      change: 'Change',
      add: 'Add',
      screenPwTitle: 'Clock-in screen password',
      curScreenPw: 'Current clock-in screen password',
      workDate: 'Work date',
      clockIn: 'Clock in',
      clockOut: 'Clock out',
      tips: 'Tips ($)',
      boosterCheck: 'Booster bonus (10% of wages)',
      fulltimeCheck: 'Full-time shift (booster on evening hours only)',
      fulltimeShort: 'Full-time',
      eveningStart: 'Evening shift start',
      masterPinTitle: 'Master PIN (owner only)',
      masterPinDesc: 'Owner-only number that opens any employee\'s records and profile.',
      masterPinNew: 'New master PIN (4-8 digits)',
      eveOrder: 'Evening start must be between clock-in and clock-out.',
      holidayCheck: 'Holiday bonus (50% of wages)',
      tipsPh: 'Servers only',
      timePh: '14:00',
      save: 'Save',
      cancel: 'Cancel',
      loginTitle: 'Admin login',
      password: 'Password',
      empModalTitle: 'Employee management',
      empFormNew: 'Add new employee',
      empFormEdit: 'Edit employee: ',
      empName: 'Employee name *',
      role: 'Role',
      roleServer: 'Server',
      roleKitchen: 'Kitchen',
      hourlyRate: 'Hourly rate ($)',
      ratePh: 'e.g. 19.00',
      empPin: 'Employee PIN (4–8 digits, for clock-in)',
      empPinPh: 'Leave blank for none',
      email: 'Email',
      phone: 'Phone',
      address: 'Address',
      sin: 'SIN',
      birthday: 'Birthday',
      firstShift: 'First shift date',
      clear: 'Clear',
      del: 'Delete',
      edit: 'Edit',
      empListTitle: 'Registered employees',
      empListDesc: 'Tap an employee to open and edit their details.',
      empInfoTitle: 'Employee info list',
      empInfoDesc: 'Full employee details, visible to the owner only.',
      empCsvBtn: 'Export CSV',
      calStat: 'Stat holiday ×1.5',
      editShiftTitle: 'Edit shift record',
      wrongPw: 'Incorrect password.',
      fail3: '3 failed attempts. An alert has been sent to the manager.',
      toastEmpFail: 'Failed to load employees.',
      toastPayrollFail: 'Failed to load payroll data.',
      toastPickPeriod: 'Select a period.',
      toastNoCsv: 'No data to export.',
      toastSaved: 'Saved.',
      toastDeleted: 'Deleted.',
      needAll: 'Enter the date, clock-in, and clock-out times.',
      badTime: 'Enter time in 24-hour format (HH:MM). e.g. 14:00',
      futureTime: 'Time cannot be later than now.',
      saveFail: 'Save failed: ',
      needName: 'Employee name is required.',
      badPin: 'Employee PIN must be 4–8 digits.',
      staffEditTitle: 'Edit my info',
  histBtn: 'History',
  histTitle: 'My work history',
  tabCalendar: 'Calendar',
  calTipsTotal: 'Total tips',
  calServerTips: 'Server tips',
  calKitchenTips: 'Kitchen tips',
  calSemiEmp: 'Tips by employee',
  calWageTotal: 'Total wages',
  calDailyPay: 'Pay',
  calNone: 'No records for this day.',
  histTotal: 'Total hours',
  histDays: 'days worked',
  histNone: 'No shifts in this period.',
      pinForgot: 'Forgot your PIN?',
      pinSetupTitle: 'Create your PIN',
      pinSetupNote: 'No PIN set yet. Create your own PIN first to view your records and info.',
      sessionExpired: 'Your login session expired. Please log in again.',
      loadFail: 'Failed to load.',
      boostMark: 'Booster 10%',
      pinResetTitle: 'Find PIN',
      pinResetFor: 'For',
      newPin: 'New PIN',
      confirmPin: 'Confirm PIN',
      changePin: 'Change PIN',
      pinWrong: 'Wrong PIN.',
      pinChanged: 'PIN changed.',
      noEmailForPin: 'No registered email. Please ask your manager.',
      delFail: 'Delete failed: ',
      changeFail: 'Change failed: ',
      curPwWrong: 'Current password is incorrect.',
      curScreenPwWrong: 'Current clock-in screen password is incorrect.',
      pwShort: 'New password must be at least 4 characters.',
      pwMismatch: 'New passwords do not match.',
      pwSame: 'Enter a different password from the current one.',
      pwChanged: 'Password changed.',
      screenPwChanged: 'Clock-in screen password changed.',
      confirmDelEmp: 'Delete this employee? Their shift records will also be deleted.',
      confirmDelShift: 'Delete this shift record?',
      needInfo: 'More info needed.',
      none: 'None',
      noShifts: 'No shift records.',
      total: 'Total',
      tipPoolTitle: 'Kitchen tip pool',
      tipPoolTotalTips: 'Server tips total ($)',
      tipPoolAppTips: 'Delivery app tips ($)',
      tipPoolDistributable: 'Distributable',
      poolServerTips: 'Server tips total',
      poolKitchenFormula: 'Kitchen tips (server tips ÷7 × 3)',
      poolGrandTotal: 'Total tips',
      tipPoolServerShare: 'Servers 70%',
      tipPoolKitchenShare: 'Kitchen 30%',
      tipPoolNote: '(distributed by kitchen hours worked)',
      thEmployee: 'Employee',
      thRole: 'Role',
      thHours: 'Hours',
      thRate: 'Hourly rate',
      thWage: 'Wages',
      thVacation: 'Vacation',
      thBooster: 'Booster',
      thHoliday: 'Holiday',
      thBonus: 'Bonus',
      bonusHide: 'Hide allowances',
      thTips: 'Tips',
      thKShare: 'Kitchen tips',
      thTotal: 'Total',
      csvDateRange: 'Date range',
      tipsWord: 'Tips',
      tabCloseout: 'Close-out',
      coSection: 'Register close-out',
      coWorkedHours: 'Hours worked',
      coTotalSales: 'Total sales ($)',
      coCashSales: 'Cash sales ($) (incl. tips)',
      coTotalTip: 'Tip ($) · Total Tip',
      coServerTip: 'Server tip (70%)',
      coEmp2: 'Second server (optional)',
      coNone: 'None',
      coEach: 'each',
      coTillCount: 'Till count',
      coCounted: 'Counted till',
      coExpected: 'Expected',
      coPrevNote: 'Prev. till',
      coDiff: 'Difference',
      coMatch: 'Match',
      coThDate: 'Date',
      coThTotalSales: 'Total sales',
      coThCash: 'Cash sales',
      coThTips: 'Tips',
      coThCounted: 'Counted',
      coThExpected: 'Expected',
      coThDiff: 'Diff',
      coSummary: 'Monthly totals',
      coMismatch: 'Mismatches',
      coNoData: 'No close-out records.',
      todayCo: "Today's close-out",
      todayCoEmpty: 'No close-out entered today yet.',
      coSaveFail: 'Close-out save failed: ',
      setupTitle: 'Setup required',
      setupBody: 'Enter your Supabase URL and anon key in config.js, then reload.<br>See README.md for the steps.'
    }
  };

  function t(key) {
    var d = I18N[lang] || I18N.ko;
    return d[key] != null ? d[key] : (I18N.ko[key] || key);
  }

  function setLang(l) {
    lang = (l === 'en') ? 'en' : 'ko';
    try { localStorage.setItem('jimoco_lang', lang); } catch (e) {}
    applyI18n();
  }

  function applyI18n() {
    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      el.textContent = t(el.getAttribute('data-i18n'));
    });
    document.querySelectorAll('[data-i18n-ph]').forEach(function (el) {
      el.setAttribute('placeholder', t(el.getAttribute('data-i18n-ph')));
    });
    document.documentElement.lang = lang;
    document.title = t('appTitle');
    var lt = $('langToggle');
    if (lt) lt.textContent = (lang === 'ko') ? 'EN' : '한국어';
    renderClock();
    if (payrollCache.computed) renderPayroll();
    if (closeoutCache.month) renderCloseouts();
    if (!$('empModal').classList.contains('hidden')) renderEmpList();
  }

  function countLabel(n) {
    return lang === 'ko' ? '(' + n + '명)' : '(' + n + ')';
  }

  function roleName(role) {
    return role === 'server' ? t('roleServer') : t('roleKitchen');
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function toast(msg) {
    var tEl = $('toast');
    tEl.textContent = msg;
    tEl.classList.remove('hidden');
    setTimeout(function () { tEl.classList.add('hidden'); }, 2500);
  }

  function openModal(id) { $(id).classList.remove('hidden'); }
  function closeModal(id) { $(id).classList.add('hidden'); }

  /* ---------- 날짜/시간 (America/Vancouver 기준, 24시간제) ---------- */
  function todayStr() {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Vancouver', year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(new Date());
  }

  function vancouverNow() {
    return new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Vancouver' }));
  }

  function fmtYMD(d) {
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + m + '-' + day;
  }

  function vancouverOffsetMs(date) {
    var dtf = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Vancouver',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
    });
    var parts = {};
    dtf.formatToParts(date).forEach(function (p) { parts[p.type] = p.value; });
    var asUTC = Date.UTC(+parts.year, +parts.month - 1, +parts.day,
      +parts.hour % 24, +parts.minute, +parts.second);
    return asUTC - date.getTime();
  }

  // "2026-10-16" + "09:00" -> 밴쿠버 현지시간 기준 epoch ms
  function toMs(dateStr, timeStr) {
    var dp = dateStr.split('-').map(Number);
    var tp = timeStr.split(':').map(Number);
    var guess = new Date(Date.UTC(dp[0], dp[1] - 1, dp[2], tp[0], tp[1] || 0));
    return guess.getTime() - vancouverOffsetMs(guess);
  }

  // 24시간제 검증 + 정규화 ("9:00" -> "09:00", "1400" -> "14:00"), 실패 시 null
  function normTime24(str) {
    var s = (str || '').trim().replace(/\s/g, '');
    if (/^\d{3,4}$/.test(s)) {
      s = s.length === 3 ? '0' + s : s;
      s = s.slice(0, 2) + ':' + s.slice(2);
    }
    var m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(s);
    if (!m) return null;
    return m[1].padStart(2, '0') + ':' + m[2];
  }

  function fmtTime(iso) {
    var s = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Vancouver', hour: '2-digit', minute: '2-digit', hour12: false
    }).format(new Date(iso));
    return s.replace(/^24:/, '00:');
  }

  function fmtDateV(isoOrDate) {
    var d = isoOrDate instanceof Date ? isoOrDate : new Date(isoOrDate);
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Vancouver', year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(d);
  }

  function dollars(cents) {
    return (Math.round(cents) / 100).toFixed(2);
  }

  function parseCents(str) {
    var v = parseFloat(str);
    return (isNaN(v) || v < 0) ? 0 : Math.round(v * 100);
  }

  /* ---------- 현재 시각 표시 (America/Vancouver, 24시간제) ---------- */
  function tickClock() {
    try {
      var now = new Date();
      var dFmt = new Intl.DateTimeFormat(lang === 'ko' ? 'ko-KR' : 'en-US', {
        timeZone: 'America/Vancouver',
        year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short'
      });
      var tFmt = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'America/Vancouver',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
      });
      var cd = $('clockDate'), ct = $('clockTime');
      if (cd) cd.textContent = dFmt.format(now);
      if (ct) ct.textContent = tFmt.format(now).replace(/^24:/, '00:');
    } catch (e) { /* 구형 브라우저에서는 표시 생략 */ }
  }

  function startClock() {
    tickClock();
    setInterval(tickClock, 1000);
  }

  function nowHM() {
    try {
      var parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'America/Vancouver',
        hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
      }).formatToParts(new Date());
      var h = '00', m = '00';
      parts.forEach(function (p) {
        if (p.type === 'hour') h = p.value;
        if (p.type === 'minute') m = p.value;
      });
      if (h === '24') h = '00';
      return h + ':' + m;
    } catch (e) { return ''; }
  }

  /* ---------- 초기화 ---------- */
  /* ---------- RPC 헬퍼 (보안: 개인정보·비밀번호는 RPC로만 접근) ---------- */
  async function rpc(name, args) {
    var res = await supabase.rpc(name, args || {});
    if (res.error) throw new Error(res.error.message);
    return res.data;
  }
  /* 매니저 세션이 필요한 RPC: 토큰 만료 시 null이 돌아오면 알리고 중단 */
  async function mgrRpc(name, args) {
    var a = args || {};
    a.p_token = mgrToken;
    var data = await rpc(name, a);
    if (data === null || data === false) { toast(t('sessionExpired')); throw new Error('session'); }
    return data;
  }
  /* 로그인 세션이 있으면 개인정보 포함 전체 직원 목록으로 교체 */
  async function refreshFullEmployees() {
    if (!mgrToken) return;
    try {
      var rows = await rpc('admin_employees', { p_token: mgrToken });
      if (!rows) return;
      allEmployees = rows;
      employees = rows.filter(function (e) { return e.active && !e.pending; });
    } catch (e) {}
  }
  async function reloadEmployees() {
    if (mgrToken) { await refreshFullEmployees(); }
    else { await loadEmployees(); }
  }

  async function init() {
    try { lang = localStorage.getItem('jimoco_lang') === 'en' ? 'en' : 'ko'; } catch (e) { lang = 'ko'; }
    bindStatic();
    applyI18n();
    startClock();
    if (!cfg.SUPABASE_URL || cfg.SUPABASE_URL.indexOf('YOUR_PROJECT') !== -1) {
      document.body.innerHTML =
        '<div style="max-width:640px;margin:80px auto;padding:32px;font-family:-apple-system,sans-serif">' +
        '<h1>' + esc(t('setupTitle')) + '</h1>' +
        '<p>' + t('setupBody') + '</p></div>';
      return;
    }
    supabase = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
    // 페이지가 열릴 때마다(새로고침 포함) 항상 잠금 화면을 먼저 보여줌
    showLock();
  }

  function showLock() {
    $('screenPw').value = '';
    $('screenMsg').textContent = '';
    $('screenMsg').className = 'msg';
    $('lockOverlay').classList.remove('hidden');
    setTimeout(function () { $('screenPw').focus(); }, 100);
  }

  async function unlockScreen() {
    sessionStorage.setItem('jimoco_unlocked', '1');
    resetFailCount();
    $('lockOverlay').classList.add('hidden');
    await loadEmployees();
    if (managerAuthed && mgrToken) await refreshFullEmployees();
    renderClock();
    if (managerAuthed) showManager(false);
    setPeriod('month');
  }

  function bindStatic() {
    $('logoBtn').addEventListener('click', goHome);
    $('langToggle').addEventListener('click', function () {
      setLang(lang === 'ko' ? 'en' : 'ko');
    });
    $('managerBtn').addEventListener('click', function () {
      if (managerAuthed) { showManager(true); return; }
      $('loginUser').value = '';
      $('loginPin').value = '';
      $('loginMsg').textContent = '';
      openModal('loginModal');
      setTimeout(function () { $('loginPin').focus(); }, 100);
    });
    $('loginBtn').addEventListener('click', tryLogin);
    $('loginPin').addEventListener('keydown', function (e) { if (e.key === 'Enter') tryLogin(); });
    $('logoutBtn').addEventListener('click', function () {
      managerAuthed = false;
      managerRole = 'owner';
      mgrToken = null;
      sessionStorage.removeItem('jimoco_mgr');
      sessionStorage.removeItem('jimoco_mgr_user');
      sessionStorage.removeItem('jimoco_mgr_token');
      goHome();
    });

    document.querySelectorAll('[data-close]').forEach(function (b) {
      b.addEventListener('click', function () { b.closest('.modal').classList.add('hidden'); });
    });

    $('shiftSave').addEventListener('click', saveShift);
    $('openCloseout').addEventListener('click', openCloseoutModal);
    $('openTodayCo').addEventListener('click', openTodayCoModal);
    $('coSave').addEventListener('click', saveCloseoutModal);
    $('openEmpModal').addEventListener('click', openEmpModal);
    $('openEmpPendingBtn').addEventListener('click', openEmpModal);
    $('empForm').addEventListener('submit', saveEmployee);
    $('empCsvBtn').addEventListener('click', exportEmpCsv);
    $('empReset').addEventListener('click', resetEmpForm);
    $('empDelete').addEventListener('click', deleteEmployee);

    document.querySelectorAll('.tabbar .tab').forEach(function (tab) {
      tab.addEventListener('click', function () {
        if (tab.dataset.tab === 'pin' && managerRole !== 'owner') return; /* 오너 전용 */
        if (tab.dataset.tab === 'calendar' && managerRole !== 'owner') return; /* 오너 전용 */
        document.querySelectorAll('.tabbar .tab').forEach(function (x) { x.classList.remove('active'); });
        tab.classList.add('active');
        document.querySelectorAll('.tab-panel').forEach(function (p) { p.classList.add('hidden'); });
        $('tab-' + tab.dataset.tab).classList.remove('hidden');
        if (tab.dataset.tab === 'pin' && managerRole === 'owner') loadPwManager();
        if (tab.dataset.tab === 'calendar' && managerRole === 'owner') loadCalendar();
        if (tab.dataset.tab === 'closeout') {
          if (!$('coMonth').value) $('coMonth').value = todayStr().slice(0, 7);
          loadCloseouts();
        }
      });
    });

    document.querySelectorAll('[data-period]').forEach(function (b) {
      b.addEventListener('click', function () { setPeriod(b.dataset.period); });
    });
    $('payLoad').addEventListener('click', loadPayroll);
    /* 날짜 바꾸면 자동 조회 (조회 버튼 생략) */
    $('payStart').addEventListener('change', loadPayroll);
    $('payEnd').addEventListener('change', loadPayroll);
    $('coMonth').addEventListener('change', loadCloseouts);
    $('payCsv').addEventListener('click', exportCSV);
    document.querySelectorAll('.role-filter').forEach(function (b) {
      b.addEventListener('click', function () {
        document.querySelectorAll('.role-filter').forEach(function (x) { x.classList.remove('active'); });
        b.classList.add('active');
        payrollRoleFilter = b.dataset.role;
        renderPayroll();
      });
    });
    $('bonusDetailToggle').addEventListener('change', function () {
      showBonusDetail = !$('bonusDetailToggle').checked;
      renderPayroll();
    });
    $('pinChangeBtn').addEventListener('click', changeOwnerPassword);
    $('ownerUserSaveBtn').addEventListener('click', saveOwnerUsername);
    $('mgrAddBtn').addEventListener('click', addManager);
    $('screenPwChangeBtn').addEventListener('click', changeScreenPassword);
    $('masterPinChangeBtn').addEventListener('click', changeMasterPin);
    bindPwViewer('showMasterPinBtn', 'master_pin', 'viewMasterPin');
    $('editFulltime').addEventListener('change', function () { $('editEveningRow').classList.toggle('hidden', !this.checked); });
    $('shiftFulltime').addEventListener('change', function () { $('shiftEveningRow').classList.toggle('hidden', !this.checked); });
    bindPwViewer('showScreenPwBtn', 'screen_password', 'viewScreenPw');
    bindPwViewer('showOwnerPwBtn', 'manager_pin', 'viewOwnerPw');
    /* 관리자 로그인 모달: 회원가입 / 비밀번호 찾기 */
    $('openSignup').addEventListener('click', openSignup);
    $('closeSignup').addEventListener('click', function () { closeModal('signupModal'); });
    $('signupBtn').addEventListener('click', doSignup);
    $('openReset').addEventListener('click', openReset);
    $('closeReset').addEventListener('click', function () { closeModal('resetModal'); });
    $('sendCodeBtn').addEventListener('click', sendResetCode);
    $('doResetBtn').addEventListener('click', doResetPassword);
    $('pinGateOk').addEventListener('click', checkPinGate);
    $('pinSetupOk').addEventListener('click', doPinSetup);
    $('pinSetupInput2').addEventListener('keydown', function (e) { if (e.key === 'Enter') doPinSetup(); });
    $('pinGateInput').addEventListener('keydown', function (e) { if (e.key === 'Enter') checkPinGate(); });
    $('pinForgotLink').addEventListener('click', openPinReset);
    $('pinSendCodeBtn').addEventListener('click', sendPinResetCode);
    $('pinDoResetBtn').addEventListener('click', doPinReset);
    $('staffEditSave').addEventListener('click', saveStaffEdit);
    $('histPrev').addEventListener('click', function () { histPeriod = shiftSemiPeriod(histPeriod, -1); renderHistory(); });
    $('histNext').addEventListener('click', function () { histPeriod = shiftSemiPeriod(histPeriod, 1); renderHistory(); });
    $('calPrev').addEventListener('click', function () { calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() - 1, 1); calSelected = null; $('calDetail').innerHTML = ''; loadCalendar(); });
    $('calNext').addEventListener('click', function () { calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 1); calSelected = null; $('calDetail').innerHTML = ''; loadCalendar(); });
    /* 새 직원 등록 (출근 화면) */
    $('openEmpReg').addEventListener('click', openEmpReg);
    $('closeEmpReg').addEventListener('click', function () { closeModal('empRegModal'); });
    $('empRegBtn').addEventListener('click', doEmpReg);
    var eab = $('empApprove');
    if (eab) eab.addEventListener('click', doApproveEmployee);
    $('screenUnlockBtn').addEventListener('click', tryUnlock);
    $('screenPw').addEventListener('keydown', function (e) { if (e.key === 'Enter') tryUnlock(); });
    // 비밀번호 눈알 토글
    document.querySelectorAll('.pw-eye').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var inp = btn.parentElement.querySelector('input');
        if (!inp) return;
        var show = inp.type === 'password';
        inp.type = show ? 'text' : 'password';
        btn.textContent = show ? '🙈' : '👁';
      });
    });
    $('editShiftSave').addEventListener('click', saveEditedShift);
    $('editShiftDelete').addEventListener('click', deleteShift);
    $('coLoad').addEventListener('click', loadCloseouts);
    ['shiftIn', 'shiftOut', 'shiftDate'].forEach(function (id) {
      $(id).addEventListener('input', function () {
        recalcCloseout();
      });
    });
    ['coTotalSales', 'coCashSales', 'coTips', 'coDate'].forEach(function (id) {
      $(id).addEventListener('input', function () {
        if (id === 'coDate') fetchPrevCounted($('coDate').value);
        recalcCloseout();
      });
    });
    DENOMS.forEach(function (d) {
      $(d.id).addEventListener('input', recalcCloseout);
    });
    $('coEmp').addEventListener('change', function () { syncCoEmp2($('coEmp2').value); recalcCloseout(); });
    $('coEmp2').addEventListener('change', recalcCloseout);
  }

  function goHome() {
    document.querySelectorAll('.modal').forEach(function (m) { m.classList.add('hidden'); });
    $('view-manager').classList.add('hidden');
    $('view-clock').classList.remove('hidden');
    window.scrollTo(0, 0);
  }

  function showManager(toPayroll) {
    $('view-clock').classList.add('hidden');
    $('view-manager').classList.remove('hidden');
    /* 매니저 직급은 비밀번호 관리·달력 탭 숨김 (오너 전용) */
    var pinBtn = $('pinTabBtn');
    if (pinBtn) pinBtn.style.display = (managerRole === 'owner') ? '' : 'none';
    var calBtn = $('calTabBtn');
    if (calBtn) calBtn.style.display = (managerRole === 'owner') ? '' : 'none';
    if (managerRole !== 'owner') {
      var pinPanel = $('tab-pin');
      if (pinPanel && !pinPanel.classList.contains('hidden')) {
        pinPanel.classList.add('hidden');
        document.querySelectorAll('.tabbar .tab').forEach(function (x) { x.classList.remove('active'); });
        var first = document.querySelector('.tabbar .tab[data-tab="payroll"]');
        if (first) { first.classList.add('active'); $('tab-payroll').classList.remove('hidden'); }
      }
    }
    window.scrollTo(0, 0);
  }

  /* ---------- 직원 목록 ---------- */
  async function loadEmployees() {
    var res = await supabase.from('employees').select('*').eq('active', true).order('name');
    if (res.error) { toast(t('toastEmpFail')); return; }
    employees = res.data || [];
  }

  function servers() { return employees.filter(function (e) { return e.role === 'server'; }); }
  function kitchen() { return employees.filter(function (e) { return e.role !== 'server'; }); }

  function renderClock() {
    var sv = servers(), kt = kitchen();
    $('serverCount').textContent = countLabel(sv.length);
    $('kitchenCount').textContent = countLabel(kt.length);
    $('serverList').innerHTML = sv.map(function (e) {
      return '<div class="emp-line-row"><button class="emp-line grow" data-id="' + e.id + '">' + esc(e.name) + '</button>' +
        '<button type="button" class="btn btn-chip emp-history" data-history="' + e.id + '">' + esc(t('histBtn')) + '</button>' +
        '<button type="button" class="btn btn-chip emp-self-edit" data-self-edit="' + e.id + '">' + esc(t('edit')) + '</button></div>';
    }).join('');
    $('kitchenList').innerHTML = kt.map(function (e) {
      return '<div class="emp-line-row"><button class="emp-line grow" data-id="' + e.id + '">' + esc(e.name) + '</button>' +
        '<button type="button" class="btn btn-chip emp-history" data-history="' + e.id + '">' + esc(t('histBtn')) + '</button>' +
        '<button type="button" class="btn btn-chip emp-self-edit" data-self-edit="' + e.id + '">' + esc(t('edit')) + '</button></div>';
    }).join('');
    document.querySelectorAll('.emp-line').forEach(function (b) {
      b.addEventListener('click', function () {
        var emp = employees.find(function (x) { return x.id === b.dataset.id; });
        if (emp) openShiftModal(emp);
      });
    });
    document.querySelectorAll('[data-self-edit]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var emp = employees.find(function (x) { return x.id === btn.getAttribute('data-self-edit'); });
        if (emp) openStaffEdit(emp);
      });
    });
    document.querySelectorAll('[data-history]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var emp = employees.find(function (x) { return x.id === btn.getAttribute('data-history'); });
        if (emp) openEmpHistory(emp);
      });
    });
  }

  /* ---------- 출퇴근 입력 ---------- */
  var pinGateEmp = null;
  var pinGatePurpose = 'shift'; /* 'shift' = 출퇴근, 'edit' = 본인 정보 수정 */
  function openShiftModal(emp) {
    if (emp.has_pin) { openPinGate(emp, 'shift'); return; }
    openShiftForm(emp);
  }
  function openStaffEdit(emp) {
    /* PIN이 없으면 게이트부터: 마스터 PIN이면 바로 통과, 아니면 최초 설정으로 안내 */
    openPinGate(emp, 'edit', !emp.has_pin);
  }

  /* ---------- 직원 PIN 최초 설정 (PIN 없으면 기록·수정 전에 먼저 설정) ---------- */
  var pinSetupEmp = null;
  var pinSetupPurpose = 'history';
  function openPinSetup(emp, purpose) {
    pinSetupEmp = emp;
    pinSetupPurpose = purpose || 'history';
    pinGatePurpose = pinSetupPurpose;
    $('pinSetupName').textContent = emp.name;
    $('pinSetupInput').value = '';
    $('pinSetupInput2').value = '';
    $('pinSetupMsg').className = 'msg'; $('pinSetupMsg').textContent = '';
    openModal('pinSetupModal');
    setTimeout(function () { $('pinSetupInput').focus(); }, 50);
  }
  async function doPinSetup() {
    var msg = $('pinSetupMsg');
    msg.className = 'msg';
    if (!pinSetupEmp) return;
    var pin = $('pinSetupInput').value.trim(), pin2 = $('pinSetupInput2').value.trim();
    if (!/^\d{4,8}$/.test(pin)) { msg.textContent = t('badPin'); return; }
    if (pin !== pin2) { msg.textContent = t('pwMismatch'); return; }
    var ok = false;
    try { ok = await rpc('set_emp_pin_initial', { p_emp: pinSetupEmp.id, p_new_pin: pin }); } catch (e) {}
    if (!ok) { msg.textContent = t('saveFail'); return; }
    pinSetupEmp.has_pin = true;
    verifiedPin = pin;
    var idx = employees.findIndex(function (x) { return x.id === pinSetupEmp.id; });
    if (idx >= 0) employees[idx].has_pin = true;
    closeModal('pinSetupModal');
    if (pinSetupPurpose === 'edit') openStaffEditForm(pinSetupEmp);
    else if (pinSetupPurpose === 'history') openHistoryModal(pinSetupEmp);
    else openShiftForm(pinSetupEmp);
  }
  function openShiftForm(emp) {
    currentShiftEmp = emp;
    $('shiftEmpName').textContent = emp.name;
    $('shiftDate').value = todayStr();
    $('shiftIn').value = nowHM();
    $('shiftOut').value = '';
    $('shiftFulltime').checked = false;
    $('shiftEveningStart').value = '';
    $('shiftEveningRow').classList.add('hidden');
    $('shiftFulltimeRow').classList.toggle('hidden', emp.role !== 'server');
    $('shiftMsg').textContent = '';
    $('shiftMsg').className = 'msg';
    $('shiftModalBox').classList.toggle('wide', false);
    openModal('shiftModal');
  }
  var pinGateAllowSetup = false;
  function openPinGate(emp, purpose, allowSetup) {
    pinGateEmp = emp;
    pinGatePurpose = purpose || 'shift';
    pinGateAllowSetup = !!allowSetup;
    $('pinGateName').textContent = emp.name;
    $('pinGateInput').value = '';
    $('pinGateMsg').className = 'msg'; $('pinGateMsg').textContent = '';
    openModal('pinGateModal');
    setTimeout(function () { $('pinGateInput').focus(); }, 50);
  }
  async function checkPinGate() {
    var msg = $('pinGateMsg');
    msg.className = 'msg';
    if (!pinGateEmp) return;
    var pin = $('pinGateInput').value;
    var ok = false;
    try { ok = await rpc('check_emp_pin', { p_emp: pinGateEmp.id, p_pin: pin }); } catch (e) {}
    if (ok) {
      verifiedPin = pin;
      closeModal('pinGateModal');
      if (pinGatePurpose === 'edit') openStaffEditForm(pinGateEmp);
      else if (pinGatePurpose === 'history') openHistoryModal(pinGateEmp);
      else openShiftForm(pinGateEmp);
    } else if (pinGateAllowSetup) {
      /* 본인 PIN이 아직 없는 직원: 마스터 PIN도 아니면 최초 PIN 설정으로 이동 */
      closeModal('pinGateModal');
      openPinSetup(pinGateEmp, pinGatePurpose);
    } else {
      msg.textContent = t('pinWrong');
    }
  }

  /* ---------- 직원 PIN 찾기 (이메일 인증 코드) ---------- */
  var pinResetEmp = null;
  function pinResetKey(emp) { return 'pin:' + emp.id; }
  function openPinReset() {
    if (!pinGateEmp) return;
    pinResetEmp = pinGateEmp;
    closeModal('pinGateModal');
    $('pinResetName').textContent = pinResetEmp.name;
    $('pinResetStep1').classList.remove('hidden');
    $('pinResetStep2').classList.add('hidden');
    $('pinResetMsg').className = 'msg'; $('pinResetMsg').textContent = '';
    openModal('pinResetModal');
  }
  async function sendPinResetCode() {
    var msg = $('pinResetMsg');
    msg.className = 'msg';
    if (!pinResetEmp) return;
    var r = null;
    try { r = await rpc('request_reset_code', { p_key: pinResetKey(pinResetEmp) }); } catch (e) {}
    if (!r || !r.ok) {
      msg.textContent = (r && r.no_email) ? t('noEmailForPin') : t('saveFail');
      return;
    }
    $('pinResetStep1').classList.add('hidden');
    $('pinResetStep2').classList.remove('hidden');
    msg.className = 'msg ok';
    msg.textContent = t('codeSent');
  }
  async function doPinReset() {
    var msg = $('pinResetMsg');
    msg.className = 'msg';
    if (!pinResetEmp) return;
    var code = $('pinRsCode').value.trim();
    var pin = $('pinRsPin').value.trim(), pin2 = $('pinRsPin2').value.trim();
    if (!/^\d{4,8}$/.test(pin)) { msg.textContent = t('badPin'); return; }
    if (pin !== pin2) { msg.textContent = t('pwMismatch'); return; }
    var ok = false;
    try {
      ok = await rpc('complete_reset', {
        p_key: pinResetKey(pinResetEmp), p_code: code, p_new_secret: pin
      });
    } catch (e) {}
    if (!ok) { msg.textContent = t('codeFail'); return; }
    pinResetEmp.has_pin = true;
    verifiedPin = pin;
    var idx = employees.findIndex(function (x) { return x.id === pinResetEmp.id; });
    if (idx >= 0) employees[idx].has_pin = true;
    closeModal('pinResetModal');
    if (pinGatePurpose === 'edit') openStaffEditForm(pinResetEmp);
    else if (pinGatePurpose === 'history') openHistoryModal(pinResetEmp);
    else openShiftForm(pinResetEmp);
  }

  /* ---------- 직원 본인 정보 수정 (시급·직군 제외) ---------- */
  var staffEditEmp = null;
  async function openStaffEditForm(emp) {
    staffEditEmp = emp;
    var d = emp;
    try {
      var self = await rpc('get_emp_self', { p_emp: emp.id, p_pin: verifiedPin || '' });
      if (self) d = self;
    } catch (e) {}
    $('seName').value = d.name || '';
    $('sePhone').value = d.phone || '';
    $('seEmail').value = d.email || '';
    $('seAddress').value = d.address || '';
    $('seSin').value = d.sin || '';
    $('seBirthday').value = d.birthday || '';
    $('sePin').value = '';
    $('staffEditMsg').className = 'msg'; $('staffEditMsg').textContent = '';
    openModal('staffEditModal');
  }
  async function saveStaffEdit() {
    var msg = $('staffEditMsg');
    msg.className = 'msg';
    if (!staffEditEmp) return;
    var name = $('seName').value.trim();
    if (!name) { msg.textContent = t('needName'); return; }
    var pin = $('sePin').value.trim();
    if (pin && !/^\d{4,8}$/.test(pin)) { msg.textContent = t('badPin'); return; }
    var row = {
      name: name,
      phone: val('sePhone'),
      email: val('seEmail'),
      address: val('seAddress'),
      sin: val('seSin'),
      birthday: val('seBirthday') || null
    };
    if (pin) row.pin = pin;
    var ok = false;
    try {
      ok = await rpc('update_emp_self', {
        p_emp: staffEditEmp.id, p_pin: verifiedPin || '', p_row: row
      });
    } catch (e) {}
    if (!ok) { msg.textContent = t('saveFail'); return; }
    if (pin) verifiedPin = pin;
    staffEditEmp.has_pin = true;
    await reloadEmployees();
    renderClock();
    closeModal('staffEditModal');
    toast(t('toastSaved'));
  }

  /* ---------- 직원 본인 근무 기록 (세미 먼슬리: 1~15일 / 16일~말일) ---------- */
  var histEmp = null;
  var histPeriod = null; /* {start: Date, end: Date} */

  function semiPeriod(date) {
    var y = date.getFullYear(), m = date.getMonth(), d = date.getDate();
    if (d <= 15) return { start: new Date(y, m, 1), end: new Date(y, m, 15) };
    return { start: new Date(y, m, 16), end: new Date(y, m + 1, 0) };
  }
  function shiftSemiPeriod(p, dir) {
    var y = p.start.getFullYear(), m = p.start.getMonth();
    if (dir < 0) {
      if (p.start.getDate() === 16) return { start: new Date(y, m, 1), end: new Date(y, m, 15) };
      var pe = new Date(y, m, 0);
      return { start: new Date(pe.getFullYear(), pe.getMonth(), 16), end: pe };
    }
    if (p.start.getDate() === 1) return { start: new Date(y, m, 16), end: new Date(y, m + 1, 0) };
    return { start: new Date(y, m + 1, 1), end: new Date(y, m + 1, 15) };
  }
  function fmtDate(d) {
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  function openEmpHistory(emp) {
    /* PIN이 없으면 게이트부터: 마스터 PIN이면 바로 통과, 아니면 최초 설정으로 안내 */
    openPinGate(emp, 'history', !emp.has_pin);
  }

  function openHistoryModal(emp) {
    histEmp = emp;
    histPeriod = semiPeriod(new Date());
    $('histEmpName').textContent = emp.name;
    openModal('historyModal');
    renderHistory();
  }

  var histCtx = { day_shifts: [], closeouts: [] };

  async function renderHistory() {
    if (!histEmp || !histPeriod) return;
    var s = histPeriod.start, e = histPeriod.end;
    $('histPeriod').textContent = (s.getMonth() + 1) + '/' + s.getDate() + ' ~ ' + (e.getMonth() + 1) + '/' + e.getDate();
    var cur = semiPeriod(new Date());
    $('histNext').disabled = (s.getTime() === cur.start.getTime());
    $('histList').innerHTML = '';
    $('histTotal').textContent = '';
    var data = null;
    try {
      data = await rpc('emp_history', {
        p_emp: histEmp.id, p_pin: verifiedPin || '',
        p_from: fmtDate(s), p_to: fmtDate(e)
      });
    } catch (e) {}
    var rows = (data && data.mine) || [];
    histCtx = data || { day_shifts: [], closeouts: [] };
    if (!rows.length) {
      $('histList').innerHTML = '<p class="muted">' + esc(t('histNone')) + '</p>';
      return;
    }
    var wd = lang === 'ko' ? ['일', '월', '화', '수', '목', '금', '토'] : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    var totalH = 0, totalBoost = 0;
    $('histList').innerHTML = rows.map(function (r) {
      var ci = new Date(r.clock_in), co = new Date(r.clock_out);
      var h = (co - ci) / 3600000;
      totalH += h;
      var d = new Date(r.work_date + 'T12:00:00');
      function hm(dt) { function p(n) { return (n < 10 ? '0' : '') + n; } return p(dt.getHours()) + ':' + p(dt.getMinutes()); }
      var probe = Object.assign({}, r, { employees: { name: histEmp.name, role: histEmp.role, hourly_rate_cents: histEmp.hourly_rate_cents } });
      var boostC = effectiveBoosterCents(probe, histCtx.day_shifts, histCtx.closeouts);
      var ftC = isStatHoliday(r.work_date) ? 0 : fulltimeBoosterCents(probe);
      var tag = '';
      if (boostC > 0) {
        totalBoost += boostC;
        tag = '<span class="boost-tag">' + esc(t('boostMark')) +
          (ftC > 0 && r.evening_start ? ' +' + esc(t('fulltimeShort')) + ' ' + hm(new Date(r.evening_start)) + '~' + hm(co) : '') +
          ' · $' + dollars(boostC) + '</span>';
      }
      return '<div class="hist-row' + (boostC > 0 ? ' boost' : '') + '"><span>' + (d.getMonth() + 1) + '/' + d.getDate() + ' (' + wd[d.getDay()] + ')</span>' +
        '<span>' + hm(ci) + ' ~ ' + hm(co) + '</span>' +
        '<span class="hist-h">' + h.toFixed(1) + 'h</span>' + tag + '</div>';
    }).join('');
    $('histTotal').textContent = t('histTotal') + ': ' + totalH.toFixed(1) + 'h · ' + rows.length + t('histDays') +
      (totalBoost > 0 ? ' · ' + t('boostMark') + ' $' + dollars(totalBoost) : '');
  }

  /* ---------- 오너 전용 달력: 날짜별 근무시간·팁 ---------- */
  var calMonth = null; /* Date: 표시 중인 달의 1일 */
  var calData = { shifts: [], closeouts: [], names: {}, rates: {} };
  var calSelected = null; /* 'YYYY-MM-DD' */

  async function loadCalendar() {
    if (!calMonth) { var n = new Date(); calMonth = new Date(n.getFullYear(), n.getMonth(), 1); }
    var y = calMonth.getFullYear(), m = calMonth.getMonth();
    var first = fmtDate(new Date(y, m, 1)), last = fmtDate(new Date(y, m + 1, 0));
    $('calMonthLabel').textContent = lang === 'ko' ? (y + '년 ' + (m + 1) + '월') : (calMonth.toLocaleString('en-US', { month: 'long' }) + ' ' + y);
    var srows = [], crows = [];
    try {
      srows = await mgrRpc('admin_shifts', { p_from: first, p_to: last });
      crows = await mgrRpc('admin_closeouts', { p_from: first, p_to: last });
    } catch (e) {}
    calData.shifts = srows || [];
    calData.closeouts = crows || [];
    calData.names = {};
    calData.rates = {};
    calData.roles = {};
    employees.forEach(function (e) { calData.names[e.id] = e.name; calData.rates[e.id] = e.hourly_rate_cents; calData.roles[e.id] = e.role; });
    renderCalendar();
  }

  /* 그날 직원별 팁: 근무 기록 팁 우선, 없는 직원만 마감 정산 팁 사용 (이중 계산 방지) */
  function calTipsByEmp(dateStr) {
    var byEmp = {};
    calData.shifts.forEach(function (s) {
      if (s.work_date === dateStr && s.tips_cents) byEmp[s.employee_id] = (byEmp[s.employee_id] || 0) + s.tips_cents;
    });
    calData.closeouts.forEach(function (c) {
      if (c.work_date !== dateStr || !c.tips_cents) return;
      /* 두 번째 서버가 있으면 정산 팁을 반반 분배 (Jay Kim 2026-10-23) */
      var targets = (c.employee_id2 && c.employee_id2 !== c.employee_id)
        ? [c.employee_id, c.employee_id2] : [c.employee_id];
      var half = Math.round(c.tips_cents / 2);
      targets.forEach(function (eid, i) {
        if (!byEmp[eid]) byEmp[eid] = (byEmp[eid] || 0) + (targets.length === 2 ? (i === 0 ? c.tips_cents - half : half) : c.tips_cents);
      });
    });
    return byEmp;
  }

  /* 그날 팁 계산: 서버팁(본인 팁 합계) + 주방 풀(서버팁 ÷7×3 = 30%)을 주방 근무시간 비율로 분배 */
  function calDayTips(dateStr) {
    var byEmp = calTipsByEmp(dateStr);
    var server = 0;
    Object.keys(byEmp).forEach(function (eid) {
      if (calData.roles[eid] === 'server') server += byEmp[eid];
    });
    var pool = Math.round(server * 3 / 7);
    var kh = {}, ktot = 0;
    calData.shifts.forEach(function (s) {
      if (s.work_date !== dateStr) return;
      if (calData.roles[s.employee_id] === 'server') return;
      var h = (new Date(s.clock_out) - new Date(s.clock_in)) / 3600000;
      if (h > 0) { kh[s.employee_id] = (kh[s.employee_id] || 0) + h; ktot += h; }
    });
    /* Jo 룰 2026-10-20: 주방 풀은 주방 근무로만 분배 (오너도 서버 근무는 제외, 주방 기록 근무만 포함) */
    var shares = {}, assigned = 0, topEmp = null;
    Object.keys(kh).forEach(function (eid) { if (topEmp === null || kh[eid] > kh[topEmp]) topEmp = eid; });
    Object.keys(kh).forEach(function (eid) {
      if (eid === topEmp) return;
      shares[eid] = ktot > 0 ? Math.round(pool * kh[eid] / ktot) : 0;
      assigned += shares[eid];
    });
    if (topEmp !== null) shares[topEmp] = pool - assigned;
    return { server: server, pool: pool, shares: shares, byEmp: byEmp };
  }

  function calDayStats(dateStr) {
    var hours = 0;
    calData.shifts.forEach(function (s) {
      if (s.work_date === dateStr) hours += (new Date(s.clock_out) - new Date(s.clock_in)) / 3600000;
    });
    var dt = calDayTips(dateStr);
    return { hours: hours, tips: dt.server, kitchenTips: dt.pool };
  }

  function renderCalendar() {
    var y = calMonth.getFullYear(), m = calMonth.getMonth();
    var firstDow = new Date(y, m, 1).getDay();
    var daysInMonth = new Date(y, m + 1, 0).getDate();
    var todayStr = fmtDate(new Date());
    var html = '';
    for (var i = 0; i < firstDow; i++) html += '<div class="cal-cell empty"></div>';
    for (var d = 1; d <= daysInMonth; d++) {
      var ds = fmtDate(new Date(y, m, d));
      var st = calDayStats(ds);
      var cls = 'cal-cell' + (ds === todayStr ? ' today' : '') + (ds === calSelected ? ' selected' : '');
      html += '<button type="button" class="' + cls + '" data-cal-day="' + ds + '">' +
        '<span class="cal-day">' + d + '</span>' +
        (st.hours > 0 ? '<span class="cal-h">' + st.hours.toFixed(1) + 'h</span>' : '') +
        (st.tips > 0 ? '<span class="cal-t">$' + dollars(st.tips) + '</span>' : '') +
        (st.kitchenTips > 0 ? '<span class="cal-tk">$' + dollars(st.kitchenTips) + '</span>' : '') +
        '</button>';
    }
    $('calGrid').innerHTML = html;
    renderCalSummary();
    document.querySelectorAll('[data-cal-day]').forEach(function (cell) {
      cell.addEventListener('click', function () {
        calSelected = cell.getAttribute('data-cal-day');
        renderCalendar();
        renderCalDetail();
      });
    });
    if (calSelected) renderCalDetail();
  }

  /* 세미 먼슬리(1–15 / 16–말일) 파트별 팁 합계 + 직원별 팁 합계 (달력은 오너 전용 탭) */
  function renderCalSummary() {
    var el = $('calSummary');
    if (!el) return;
    var y = calMonth.getFullYear(), m = calMonth.getMonth();
    var lastDay = new Date(y, m + 1, 0).getDate();
    function aggEmp(from, to) {
      var per = {};
      for (var d = from; d <= to; d++) {
        var dt = calDayTips(fmtDate(new Date(y, m, d)));
        Object.keys(dt.byEmp).forEach(function (eid) {
          if (calData.roles[eid] === 'server') per[eid] = (per[eid] || 0) + dt.byEmp[eid];
        });
        Object.keys(dt.shares).forEach(function (eid) { per[eid] = (per[eid] || 0) + dt.shares[eid]; });
      }
      return Object.keys(per).map(function (eid) { return { name: calData.names[eid] || '?', amt: per[eid] }; })
        .filter(function (r) { return r.amt > 0; })
        .sort(function (a, b) { return b.amt - a.amt; });
    }
    function block(from, to) {
      var s = 0, k = 0;
      for (var d = from; d <= to; d++) {
        var dt = calDayTips(fmtDate(new Date(y, m, d)));
        s += dt.server; k += dt.pool;
      }
      if (s + k <= 0) return '';
      var rows = aggEmp(from, to).map(function (r) {
        return '<tr><td>' + esc(r.name) + '</td><td>$' + dollars(r.amt) + '</td></tr>';
      }).join('');
      return '<p class="hist-total">' + (m + 1) + '/' + from + '–' + (m + 1) + '/' + to +
        ' · ' + esc(t('calServerTips')) + ' $' + dollars(s) +
        ' · ' + esc(t('calKitchenTips')) + ' $' + dollars(k) +
        ' · ' + esc(t('calTipsTotal')) + ' $' + dollars(s + k) + '</p>' +
        '<h4 class="cal-semi-title">' + (m + 1) + '/' + from + '–' + (m + 1) + '/' + to + ' ' + esc(t('calSemiEmp')) + '</h4>' +
        '<table class="pay cal-emp-tips">' + rows + '</table>';
    }
    el.innerHTML = block(1, 15) + block(16, lastDay);
  }

  function renderCalDetail() {
    if (!calSelected) { $('calDetail').innerHTML = ''; return; }
    var d = new Date(calSelected + 'T12:00:00');
    var wd = lang === 'ko' ? ['일', '월', '화', '수', '목', '금', '토'] : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    var dayShifts = calData.shifts.filter(function (s) { return s.work_date === calSelected; });
    var dayCloseouts = calData.closeouts.filter(function (c) { return c.work_date === calSelected; });
    var title = (d.getMonth() + 1) + '/' + d.getDate() + ' (' + wd[d.getDay()] + ')';
    if (!dayShifts.length && !dayCloseouts.length) {
      $('calDetail').innerHTML = '<h3>' + title + '</h3><p class="muted">' + esc(t('calNone')) + '</p>';
      return;
    }
    var totalH = 0, totalPayCents = 0, totalTips = 0;
    function hm(dt) { function p(n) { return (n < 10 ? '0' : '') + n; } return p(dt.getHours()) + ':' + p(dt.getMinutes()); }
    /* 그날 팁: 서버는 본인 팁, 주방은 서버팁 30% 풀을 근무시간 비율로 분배 */
    var dayTips = calDayTips(calSelected);
    var tipByEmp = dayTips.byEmp;
    totalTips = dayTips.server + dayTips.pool;
    /* 직원별 합치기 (근무 기록 + 마감만 있는 직원도 포함) */
    var empIds = [];
    dayShifts.forEach(function (s) { if (empIds.indexOf(s.employee_id) < 0) empIds.push(s.employee_id); });
    dayCloseouts.forEach(function (c) { if (empIds.indexOf(c.employee_id) < 0) empIds.push(c.employee_id); });
    var rows = empIds.map(function (eid) {
      var sub = [];
      var h = 0;
      dayShifts.forEach(function (s) {
        if (s.employee_id !== eid) return;
        var sh = (new Date(s.clock_out) - new Date(s.clock_in)) / 3600000;
        h += sh;
        sub.push(hm(new Date(s.clock_in)) + ' ~ ' + hm(new Date(s.clock_out)) + ' · ' + sh.toFixed(1) + 'h');
      });
      totalH += h;
      var rate = calData.rates[eid];
      if (h > 0 && rate != null) {
        var statDay = isStatHoliday(calSelected);
        var pay = Math.round(h * rate * (statDay ? 1.5 : 1));
        totalPayCents += pay;
        sub.push(t('calDailyPay') + ' $' + dollars(pay) + (statDay ? ' (' + esc(t('calStat')) + ')' : ''));
      }
      if (calData.roles[eid] === 'server' && tipByEmp[eid]) sub.push('<span class="tip-s">' + esc(t('tipsWord')) + ' $' + dollars(tipByEmp[eid]) + '</span>');
      if (dayTips.shares[eid]) sub.push('<span class="tip-k">' + esc(t('tipsWord')) + ' $' + dollars(dayTips.shares[eid]) + '</span>');
      return '<div class="cal-emp-row"><div class="cal-emp-top"><span class="nm">' + esc(calData.names[eid] || '?') + '</span>' +
        (h > 0 ? '<span class="hist-h">' + h.toFixed(1) + 'h</span>' : '') + '</div>' +
        (sub.length ? '<div class="cal-emp-sub">' + sub.join(' · ') + '</div>' : '') + '</div>';
    }).join('');
    $('calDetail').innerHTML = '<h3>' + title + '</h3>' + rows +
      '<p class="hist-total">' + esc(t('histTotal')) + ': ' + totalH.toFixed(1) + 'h</p>' +
      '<p class="hist-total">' + esc(t('calWageTotal')) + ': $' + dollars(totalPayCents) + '</p>' +
      (totalTips > 0 ? '<p class="hist-total">' + esc(t('calServerTips')) + ': $' + dollars(dayTips.server) + '</p>' +
        '<p class="hist-total">' + esc(t('calKitchenTips')) + ': $' + dollars(dayTips.pool) + '</p>' +
        '<p class="hist-total">' + esc(t('calTipsTotal')) + ': $' + dollars(totalTips) + '</p>' : '');
  }

  /* ---------- 마감 정산 (별도 모달) ---------- */
  /* 두 번째 서버 선택지: 첫 번째 서버를 제외한 서버 목록 + "없음" */
  function syncCoEmp2(sel) {
    var first = $('coEmp').value;
    var opts = '<option value="">' + esc(t('coNone')) + '</option>';
    servers().forEach(function (e) {
      if (e.id !== first) opts += '<option value="' + e.id + '">' + esc(e.name) + '</option>';
    });
    $('coEmp2').innerHTML = opts;
    $('coEmp2').value = (sel && sel !== first) ? sel : '';
  }

  function openCloseoutModal() {
    coReturnToToday = false;
    var sv = servers();
    $('coEmp').innerHTML = sv.map(function (e) {
      return '<option value="' + e.id + '">' + esc(e.name) + '</option>';
    }).join('');
    syncCoEmp2('');
    $('coDate').value = todayStr();
    $('coTips').value = '';
    $('coMsg').textContent = '';
    $('coMsg').className = 'msg';
    resetCloseout();
    fetchPrevCounted($('coDate').value);
    openModal('closeoutModal');
  }

  async function saveCloseoutModal() {
    var empId = $('coEmp').value, date = $('coDate').value;
    var msg = $('coMsg');
    msg.className = 'msg';
    if (!empId || !date) { msg.textContent = t('needAll'); return; }
    var tipsCents = Math.round((parseFloat($('coTips').value) || 0) * 100);
    var r = recalcCloseout();
    var row = {
      employee_id: empId,
      employee_id2: $('coEmp2').value || null,
      work_date: date,
      total_sales_cents: parseCents($('coTotalSales').value),
      cash_sales_cents: parseCents($('coCashSales').value),
      tips_cents: tipsCents,
      counted_cents: r.counted,
      expected_cents: r.expected,
      diff_cents: r.diff
    };
    DENOMS.forEach(function (d) {
      row[d.key] = parseInt($(d.id).value, 10) || 0;
    });
    var okCo = false;
    try { okCo = await rpc('staff_upsert_closeout', { p_row: row }); } catch (e) {}
    if (!okCo) { msg.textContent = t('saveFail'); return; }
    msg.textContent = '';
    closeModal('closeoutModal');
    toast(t('toastSaved'));
    if (coReturnToToday) { coReturnToToday = false; openTodayCoModal(); }
  }

  /* ---------- 오늘의 정산 (직원용 목록·수정) ---------- */
  async function openTodayCoModal() {
    $('todayCoDate').textContent = fmtDateV(todayStr());
    $('todayCoList').innerHTML = '';
    openModal('todayCoModal');
    try {
      var rows = await rpc('staff_day_closeouts', { p_date: todayStr() });
      todayCoCache = { rows: rows || [] };
    } catch (e) {
      todayCoCache = { rows: [] };
    }
    renderTodayCloseouts();
  }

  function renderTodayCloseouts() {
    var rows = todayCoCache.rows;
    if (!rows.length) {
      $('todayCoList').innerHTML = '<p class="view-desc">' + esc(t('todayCoEmpty')) + '</p>';
      return;
    }
    var html = '<table class="pay"><tr><th>' + esc(t('thEmployee')) + '</th><th>' + esc(t('coThTotalSales')) +
      '</th><th>' + esc(t('coThCash')) + '</th><th>' + esc(t('coThTips')) + '</th><th>' +
      esc(t('coThCounted')) + '</th><th>' + esc(t('coThDiff')) + '</th><th></th></tr>';
    rows.forEach(function (r) {
      var d = r.diff_cents || 0;
      var dHtml = Math.abs(d) <= 200
        ? '<span class="diff-ok">' + esc(t('coMatch')) + '</span>'
        : '<span class="diff-bad">' + (d > 0 ? '+' : '') + '$' + dollars(d) + '</span>';
      html += '<tr><td>' + esc((r.employees && r.employees.name) || '?') +
        (r.employees2 ? ' · ' + esc(r.employees2.name) : '') + '</td><td>$' + dollars(r.total_sales_cents) +
        '</td><td>$' + dollars(r.cash_sales_cents) + '</td><td>$' + dollars(r.tips_cents) +
        '</td><td>$' + dollars(r.counted_cents) + '</td><td>' + dHtml + '</td>' +
        '<td class="row-actions"><button class="btn btn-chip" data-edit-today-co="' + r.id + '">' + esc(t('edit')) +
        '</button></td></tr>';
    });
    html += '</table>';
    $('todayCoList').innerHTML = html;
    $('todayCoList').querySelectorAll('[data-edit-today-co]').forEach(function (b) {
      b.addEventListener('click', function () { editTodayCloseout(b.getAttribute('data-edit-today-co')); });
    });
  }

  /* 정산 입력 폼에 기존 정산 행 채우기 (관리자 수정·오늘의 정산 수정 공용) */
  function fillCloseoutForm(r) {
    var sv = servers();
    var opts = sv.map(function (e) {
      return '<option value="' + e.id + '">' + esc(e.name) + '</option>';
    }).join('');
    if (r.employee_id && !sv.some(function (e) { return e.id === r.employee_id; })) {
      opts += '<option value="' + r.employee_id + '">' + esc((r.employees && r.employees.name) || '?') + '</option>';
    }
    $('coEmp').innerHTML = opts;
    $('coEmp').value = r.employee_id || '';
    syncCoEmp2(r.employee_id2 || '');
    $('coDate').value = r.work_date || '';
    $('coTotalSales').value = r.total_sales_cents != null ? (r.total_sales_cents / 100) : '';
    $('coCashSales').value = r.cash_sales_cents != null ? (r.cash_sales_cents / 100) : '';
    $('coTips').value = r.tips_cents != null ? (r.tips_cents / 100) : '';
    DENOMS.forEach(function (d) {
      $(d.id).value = r[d.key] != null ? r[d.key] : '';
    });
    $('coMsg').textContent = '';
    $('coMsg').className = 'msg';
    fetchPrevCounted($('coDate').value);
  }

  function editTodayCloseout(id) {
    var r = (todayCoCache.rows || []).find(function (x) { return x.id === id; });
    if (!r) return;
    fillCloseoutForm(r);
    coReturnToToday = true;
    closeModal('todayCoModal');
    openModal('closeoutModal');
  }

  /* ---------- 마감 정산 (서버 전용) ---------- */
  function resetCloseout() {
    $('coTotalSales').value = '';
    $('coCashSales').value = '';
    DENOMS.forEach(function (d) { $(d.id).value = ''; });
    coPrevCounted = 0;
    recalcCloseout();
  }

  async function fetchPrevCounted(date) {
    coPrevCounted = 0;
    try {
      var v = await rpc('prev_closeout_counted', { p_date: date });
      coPrevCounted = v || 0;
    } catch (e) { /* 테이블이 없으면 0으로 처리 */ }
    recalcCloseout();
  }

  function recalcCloseout() {
    var counted = 0;
    DENOMS.forEach(function (d) {
      counted += (parseInt($(d.id).value, 10) || 0) * d.cents;
    });
    $('coCounted').textContent = '$' + dollars(counted);
    var totalTips = parseCents($('coTips').value);
    var serverTip = Math.round(totalTips * 0.7);
    if ($('coEmp2').value) {
      var eachTip = Math.round(serverTip / 2);
      $('coServerTipAmt').textContent = '$' + dollars(serverTip) +
        ' (' + t('coEach') + ' $' + dollars(eachTip) + ' × 2)';
    } else {
      $('coServerTipAmt').textContent = '$' + dollars(serverTip);
    }
    var cash = parseCents($('coCashSales').value);
    var expected = coPrevCounted + cash;
    $('coExpected').textContent = '$' + dollars(expected);
    $('coPrevNote').textContent = t('coPrevNote') + ' $' + dollars(coPrevCounted) +
      ' + ' + t('coCashSales') + ' $' + dollars(cash);
    var diff = counted - expected;
    var dEl = $('coDiff');
    if (Math.abs(diff) <= 200) {
      dEl.textContent = t('coMatch');
      dEl.className = 'diff-ok';
    } else {
      dEl.textContent = (diff > 0 ? '+' : '') + '$' + dollars(diff);
      dEl.className = 'diff-bad';
    }
    return { counted: counted, expected: expected, diff: diff };
  }

  async function saveShift() {
    var date = $('shiftDate').value, ci = $('shiftIn').value, co = $('shiftOut').value;
    var msg = $('shiftMsg');
    msg.className = 'msg';
    if (!date || !ci || !co) { msg.textContent = t('needAll'); return; }
    var ciN = normTime24(ci), coN = normTime24(co);
    if (!ciN || !coN) { msg.textContent = t('badTime'); return; }
    var inMs = toMs(date, ciN), outMs = toMs(date, coN);
    if (outMs <= inMs) outMs += 24 * 3600 * 1000; // 다음날 퇴근
    if (inMs > Date.now() + 120000 || outMs > Date.now() + 120000) { msg.textContent = t('futureTime'); return; }
    /* 풀타임(서버): 저녁 시작 시간만 저장 — 부스터 금액은 급여 계산 때 구간으로 산정해 기존 룰에 합산 */
    var isFt = false, eveIso = null;
    if (currentShiftEmp.role === 'server' && $('shiftFulltime').checked) {
      var evN = normTime24($('shiftEveningStart').value);
      if (!evN) { msg.textContent = t('badTime'); return; }
      var evMs = toMs(date, evN);
      if (evMs < inMs || evMs >= outMs) { msg.textContent = t('eveOrder'); return; }
      isFt = true;
      eveIso = new Date(evMs).toISOString();
    }
    var res = await supabase.from('shifts').insert({
      employee_id: currentShiftEmp.id,
      work_date: date,
      clock_in: new Date(inMs).toISOString(),
      clock_out: new Date(outMs).toISOString(),
      tips_cents: 0,
      booster_cents: 0,
      holiday_cents: 0,
      is_fulltime: isFt,
      evening_start: eveIso
    });
    if (res.error) { msg.textContent = t('saveFail') + res.error.message; return; }
    msg.textContent = '';
    closeModal('shiftModal');
    toast(t('toastSaved'));
  }

  /* ---------- 관리자 로그인 (오너: 아이디+비번 / 매니저: 아이디+비번) ---------- */
  async function tryLogin() {
    var user = $('loginUser').value.trim();
    var pw = $('loginPin').value.trim();
    var msg = $('loginMsg');
    msg.className = 'msg';
    var r = null;
    try { r = await rpc('app_login', { p_username: user, p_password: pw }); } catch (e) {}
    if (r && r.ok) { loginOk(r.role, r.username, r.token); return; }
    if (r && r.pending) { msg.textContent = t('pendingLogin'); return; }
    msg.textContent = t('wrongPw');
    await recordFailedPassword();
    var n = bumpFailCount();
    if (n >= 3) msg.textContent = t('fail3');
  }

  function loginOk(role, username, token) {
    resetFailCount();
    managerAuthed = true;
    managerRole = role;
    mgrToken = token || null;
    sessionStorage.setItem('jimoco_mgr', role);
    if (mgrToken) sessionStorage.setItem('jimoco_mgr_token', mgrToken);
    if (username) sessionStorage.setItem('jimoco_mgr_user', username);
    else sessionStorage.removeItem('jimoco_mgr_user');
    closeModal('loginModal');
    refreshFullEmployees();
    showManager(true);
  }

  /* ---------- 관리자 권한 회원가입 (오너 승인제) ---------- */
  function openSignup() {
    closeModal('loginModal');
    $('signupMsg').className = 'msg'; $('signupMsg').textContent = '';
    openModal('signupModal');
  }

  async function doSignup() {
    var user = $('suUser').value.trim();
    var email = $('suEmail').value.trim();
    var pw = $('suPw').value, pw2 = $('suPw2').value;
    var msg = $('signupMsg');
    msg.className = 'msg';
    if (!user) { msg.textContent = t('needUsername'); return; }
    if (!email) { msg.textContent = t('needEmail'); return; }
    if (!validEmail(email)) { msg.textContent = t('badEmail'); return; }
    if (!validManagerPw(pw)) { msg.textContent = t('mgrPwRule'); return; }
    if (pw !== pw2) { msg.textContent = t('pwMismatch'); return; }
    var r = null;
    try { r = await rpc('signup_manager', { p_username: user, p_email: email, p_password: pw }); } catch (e) {}
    if (!r || !r.ok) {
      msg.textContent = (r && r.dup) ? t('dupUser') : t('saveFail');
      return;
    }
    msg.className = 'msg ok';
    msg.textContent = t('signupPending');
    $('suUser').value = ''; $('suEmail').value = ''; $('suPw').value = ''; $('suPw2').value = '';
  }

  /* ---------- 비밀번호 찾기 (이메일 인증 코드) ---------- */
  function openReset() {
    closeModal('loginModal');
    $('resetStep1').classList.remove('hidden');
    $('resetStep2').classList.add('hidden');
    $('resetMsg').className = 'msg'; $('resetMsg').textContent = '';
    openModal('resetModal');
  }

  async function sendResetCode() {
    var user = $('rsUser').value.trim();
    var msg = $('resetMsg');
    msg.className = 'msg';
    if (!user) { msg.textContent = t('needUsername'); return; }
    var r = null;
    try { r = await rpc('request_reset_code', { p_key: user }); } catch (e) {}
    if (!r || !r.ok) {
      msg.textContent = (r && r.no_email) ? t('noEmail') : t('saveFail');
      return;
    }
    $('resetStep1').classList.add('hidden');
    $('resetStep2').classList.remove('hidden');
    msg.className = 'msg ok';
    msg.textContent = t('codeSent');
  }

  async function doResetPassword() {
    var user = $('rsUser').value.trim();
    var code = $('rsCode').value.trim();
    var pw = $('rsPw').value, pw2 = $('rsPw2').value;
    var msg = $('resetMsg');
    msg.className = 'msg';
    if (!validManagerPw(pw)) { msg.textContent = t('mgrPwRule'); return; }
    if (pw !== pw2) { msg.textContent = t('pwMismatch'); return; }
    var ok = false;
    try {
      ok = await rpc('complete_reset', { p_key: user, p_code: code, p_new_secret: pw });
    } catch (e) {}
    if (!ok) { msg.textContent = t('codeFail'); return; }
    msg.className = 'msg ok';
    msg.textContent = t('resetDone');
    $('resetStep2').classList.add('hidden');
  }

  /* ---------- 새 직원 등록 (본인 입력 → 오너 승인제) ---------- */
  function openEmpReg() {
    $('empRegMsg').className = 'msg'; $('empRegMsg').textContent = '';
    openModal('empRegModal');
  }

  async function doEmpReg() {
    var name = $('regName').value.trim();
    var phone = $('regPhone').value.trim();
    var email = $('regEmail').value.trim();
    var role = $('regRole').value;
    var pin = $('regPin').value.trim();
    var msg = $('empRegMsg');
    msg.className = 'msg';
    if (!name) { msg.textContent = t('needName'); return; }
    if (!phone) { msg.textContent = t('needPhone'); return; }
    if (email && !validEmail(email)) { msg.textContent = t('badEmail'); return; }
    if (!/^\d{4,8}$/.test(pin)) { msg.textContent = t('badPin'); return; }
    var ok = false;
    try {
      ok = await rpc('register_employee', {
        p_row: { name: name, phone: phone, email: email || null, role: role, pin: pin }
      });
    } catch (e) {}
    if (!ok) { msg.textContent = t('saveFail'); return; }
    msg.className = 'msg ok';
    msg.textContent = t('empRegDone');
    $('regName').value = ''; $('regPhone').value = ''; $('regEmail').value = ''; $('regPin').value = '';
  }

  /* 직원관리 모달: 승인 대기 목록 (오너 전용) */
  async function renderEmpPending() {
    var box = $('empPendingList');
    if (!box) return;
    box.innerHTML = '';
    var isOwner = managerRole === 'owner';
    var sec = $('empPendingSec');
    var rowsP = allEmployees.filter(function (e) { return e.pending; });
    if (!rowsP.length) {
      if (sec) sec.classList.remove('hidden');
      var cEl0 = $('empPendingCount');
      if (cEl0) cEl0.textContent = '';
      var tc0 = $('empPendingTabCount');
      if (tc0) tc0.textContent = '';
      box.innerHTML = '<p class="view-desc">' + esc(t('noPendingEmp')) + '</p>';
      updateEmpPendingBadge(0);
      return;
    }
    if (sec) sec.classList.remove('hidden');
    var cEl = $('empPendingCount');
    if (cEl) cEl.textContent = countLabel(rowsP.length);
    var tc = $('empPendingTabCount');
    if (tc) tc.textContent = countLabel(rowsP.length);
    updateEmpPendingBadge(rowsP.length);
    rowsP.forEach(function (e) {
      var row = document.createElement('div');
      row.className = 'staff-pin-row';
      var info = document.createElement('span');
      info.className = 'grow';
      info.innerHTML = esc(e.name) + ' <small class="muted">(' + esc(roleName(e.role)) + ')</small><br>' +
        '<small class="muted">' + esc(e.phone || '') + (e.email ? ' · ' + esc(e.email) : '') + '</small>';
      row.appendChild(info);
      if (isOwner) {
        var okb = document.createElement('button');
        okb.className = 'btn btn-chip';
        okb.textContent = t('approve');
        okb.addEventListener('click', function () { approveEmployee(e); });
        var nob = document.createElement('button');
        nob.className = 'btn btn-chip btn-danger';
        nob.textContent = t('reject');
        nob.addEventListener('click', function () { rejectEmployee(e.id, e.name); });
        row.appendChild(okb); row.appendChild(nob);
      }
      box.appendChild(row);
    });
  }

  function updateEmpPendingBadge(n) {
    var b = $('empPendingBadge');
    if (!b) return;
    b.textContent = n > 0 ? n : '';
    b.classList.toggle('hidden', n <= 0);
  }

  /* 승인: 직원 폼에 불러와서 시급 등 입력 후 저장 시 승인 완료 */
  function approveEmployee(e) {
    resetEmpForm();
    $('empId').value = e.id;
    $('empName').value = e.name || '';
    $('empRole').value = e.role || 'server';
    $('empPhone').value = e.phone || '';
    $('empEmail').value = e.email || '';
    $('empPin').value = '';
    $('empFormTitle').textContent = t('empApproveTitle') + e.name;
    $('empDelete').classList.add('hidden');
    var ab = $('empApprove');
    if (ab) ab.classList.remove('hidden');
    $('empName').focus();
    $('empForm').scrollIntoView();
  }

  async function doApproveEmployee() {
    var id = $('empId').value;
    if (!id) return;
    var msg = $('empMsg');
    msg.className = 'msg';
    var name = val('empName');
    if (!name) { msg.textContent = t('needName'); return; }
    var rate = parseFloat($('empRate').value);
    var pin = $('empPin').value.trim();
    if (pin && !/^\d{4,8}$/.test(pin)) { msg.textContent = t('badPin'); return; }
    var row = {
      name: name,
      role: $('empRole').value,
      hourly_rate_cents: isNaN(rate) ? null : Math.round(rate * 100),
      email: val('empEmail'),
      phone: val('empPhone'),
      address: val('empAddress'),
      sin: val('empSin'),
      birthday: val('empBirthday'),
      first_shift_date: val('empFirstShift'),
      active: true,
      pending: false
    };
    if (pin) row.pin = pin;
    var r = null;
    try { r = await mgrRpc('admin_save_employee', { p_id: id, p_row: row }); } catch (e) {}
    if (!r || !r.ok) { msg.textContent = t('saveFail'); return; }
    await reloadEmployees();
    renderClock();
    renderEmpList();
    renderEmpPending();
    resetEmpForm();
    var ab = $('empApprove');
    if (ab) ab.classList.add('hidden');
    toast(t('approved'));
  }

  async function rejectEmployee(id, name) {
    if (!confirm(t('confirmDelEmp') + '\n' + name)) return;
    var ok = false;
    try { ok = await mgrRpc('admin_delete_employee', { p_id: id }); } catch (e) {}
    if (!ok) { toast(t('delFail')); return; }
    await reloadEmployees();
    renderEmpPending();
    toast(t('toastDeleted'));
  }

  /* ---------- 첫 화면 잠금 ---------- */
  async function tryUnlock() {
    var pw = $('screenPw').value.trim();
    var msg = $('screenMsg');
    msg.className = 'msg';
    var ok = false;
    try { ok = await rpc('check_screen_password', { p_pw: pw }); } catch (e) {}
    if (ok) {
      await unlockScreen();
      return;
    }
    msg.textContent = t('wrongPw');
    await recordFailedPassword();
    var n = bumpFailCount();
    if (n >= 3) msg.textContent = t('fail3');
  }

  /* ---------- 보안: 비밀번호 실패 기록 ---------- */
  function getFailCount() {
    return parseInt(localStorage.getItem('jimoco_fail_count') || '0', 10) || 0;
  }
  function bumpFailCount() {
    var n = getFailCount() + 1;
    try { localStorage.setItem('jimoco_fail_count', String(n)); } catch (e) {}
    return n;
  }
  function resetFailCount() {
    try { localStorage.removeItem('jimoco_fail_count'); } catch (e) {}
  }

  async function getIp() {
    if (ipCache) return ipCache;
    try {
      var r = await fetch('https://api.ipify.org?format=json');
      var j = await r.json();
      ipCache = j.ip || 'unknown';
    } catch (e) { ipCache = 'unknown'; }
    return ipCache;
  }

  async function recordFailedPassword() {
    try {
      var ip = await getIp();
      await supabase.from('security_events').insert({
        event_type: 'failed_password',
        ip: ip,
        user_agent: navigator.userAgent || null
      });
    } catch (e) { /* security_events 테이블이 없어도 앱이 멈추지 않음 */ }
  }

  /* ---------- 직원 관리 ---------- */
  function needsInfo(e) {
    return !(e.email && e.phone && e.address && e.sin && e.birthday);
  }

  function openEmpModal() {
    resetEmpForm();
    /* 매니저 직급은 직원 PIN(비밀번호)란 숨김 */
    var pinRow = $('empPinRow');
    if (pinRow) pinRow.style.display = (managerRole === 'owner') ? '' : 'none';
    renderEmpList();
    renderEmpPending();
    openModal('empModal');
  }

  function resetEmpForm() {
    $('empForm').reset();
    $('empId').value = '';
    $('empFormTitle').textContent = t('empFormNew');
    $('empDelete').classList.add('hidden');
    var ab = $('empApprove');
    if (ab) ab.classList.add('hidden');
    $('empMsg').textContent = '';
  }

  function empCard(e) {
    var initial = (e.name || '?').trim().charAt(0).toUpperCase();
    var need = needsInfo(e) ? '<div class="emp-need-info">' + esc(t('needInfo')) + '</div>' : '';
    return '<div class="emp-card" data-id="' + e.id + '">' +
      '<span class="avatar">' + esc(initial) + '</span>' +
      '<span class="grow"><span class="emp-primary-line">' + esc(e.name) + '</span>' + need + '</span>' +
      '<button type="button" class="btn btn-chip emp-edit-btn" data-edit-emp="' + e.id + '">' +
      esc(t('edit')) + '</button>' +
      '</div>';
  }

  function renderEmpList() {
    var kt = kitchen(), sv = servers();
    $('mKitchenCount').textContent = countLabel(kt.length);
    $('mServerCount').textContent = countLabel(sv.length);
    $('mKitchenList').innerHTML = kt.map(empCard).join('') || '<p class="view-desc">' + esc(t('none')) + '</p>';
    $('mServerList').innerHTML = sv.map(empCard).join('') || '<p class="view-desc">' + esc(t('none')) + '</p>';
    document.querySelectorAll('.emp-card').forEach(function (b) {
      b.addEventListener('click', function () {
        var emp = employees.find(function (x) { return x.id === b.dataset.id; });
        if (emp) fillEmpForm(emp);
      });
    });
    document.querySelectorAll('[data-edit-emp]').forEach(function (btn) {
      btn.addEventListener('click', function (ev) {
        ev.stopPropagation();
        var emp = employees.find(function (x) { return x.id === btn.getAttribute('data-edit-emp'); });
        if (emp) fillEmpForm(emp);
      });
    });
    renderEmpInfo();
  }

  /* 직원 정보 목록 (오너 전용): 전체 정보를 표로 정리 + CSV 내보내기 */
  function empInfoRows() {
    return employees.filter(function (e) { return !e.pending; }).sort(function (a, b) {
      var ra = a.role === 'server' ? 1 : 0, rb = b.role === 'server' ? 1 : 0;
      return ra - rb || String(a.name).localeCompare(String(b.name));
    });
  }
  function empInfoCells(e) {
    return [e.name, e.role === 'server' ? t('servers') : t('kitchen'),
      e.hourly_rate_cents != null ? (e.hourly_rate_cents / 100).toFixed(2) : '',
      e.phone || '', e.email || '', e.address || '', e.sin || '',
      e.birthday || '', e.first_shift_date || ''];
  }
  function renderEmpInfo() {
    var sec = $('empInfoSec');
    if (!sec) return;
    if (managerRole !== 'owner') { sec.classList.add('hidden'); return; }
    sec.classList.remove('hidden');
    var list = empInfoRows();
    $('empInfoCount').textContent = countLabel(list.length);
    var heads = [t('thEmployee'), t('thRole'), t('hourlyRate'), t('phone'), t('email'), t('address'), t('sin'), t('birthday'), t('firstShift')];
    var html = '<tr>' + heads.map(function (h) { return '<th>' + esc(h) + '</th>'; }).join('') + '</tr>';
    html += list.map(function (e) {
      return '<tr>' + empInfoCells(e).map(function (v, i) {
        return '<td>' + (v ? esc(v) : '–') + '</td>';
      }).join('') + '</tr>';
    }).join('');
    $('empInfoTable').innerHTML = html;
  }
  function exportEmpCsv() {
    if (managerRole !== 'owner') return;
    function q(v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; }
    var heads = [t('thEmployee'), t('thRole'), t('hourlyRate'), t('phone'), t('email'), t('address'), t('sin'), t('birthday'), t('firstShift')];
    var lines = [heads.map(q).join(',')];
    empInfoRows().forEach(function (e) { lines.push(empInfoCells(e).map(q).join(',')); });
    var blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'jimoco-employees-' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  }

  function fillEmpForm(e) {
    $('empId').value = e.id;
    $('empName').value = e.name || '';
    $('empRole').value = e.role || 'server';
    $('empRate').value = e.hourly_rate_cents != null ? (e.hourly_rate_cents / 100).toFixed(2) : '';
    $('empPin').value = '';
    $('empEmail').value = e.email || '';
    $('empPhone').value = e.phone || '';
    $('empAddress').value = e.address || '';
    $('empSin').value = e.sin || '';
    $('empBirthday').value = e.birthday || '';
    $('empFirstShift').value = e.first_shift_date || '';
    $('empFormTitle').textContent = t('empFormEdit') + e.name;
    $('empDelete').classList.remove('hidden');
    $('empMsg').textContent = '';
    $('empName').focus();
  }

  function val(id) { var v = $(id).value.trim(); return v === '' ? null : v; }

  async function saveEmployee(ev) {
    ev.preventDefault();
    var msg = $('empMsg');
    msg.className = 'msg';
    var name = val('empName');
    if (!name) { msg.textContent = t('needName'); return; }
    var rate = parseFloat($('empRate').value);
    var pin = $('empPin').value.trim();
    if (pin && !/^\d{4,8}$/.test(pin)) { msg.textContent = t('badPin'); return; }
    var row = {
      name: name,
      role: $('empRole').value,
      hourly_rate_cents: isNaN(rate) ? null : Math.round(rate * 100),
      email: val('empEmail'),
      phone: val('empPhone'),
      address: val('empAddress'),
      sin: val('empSin'),
      birthday: val('empBirthday'),
      first_shift_date: val('empFirstShift')
    };
    if (pin) row.pin = pin;
    var id = $('empId').value;
    var r = null;
    try { r = await mgrRpc('admin_save_employee', { p_id: id || null, p_row: row }); } catch (e) {}
    if (!r || !r.ok) { msg.textContent = t('saveFail'); return; }
    await reloadEmployees();
    renderClock();
    renderEmpList();
    resetEmpForm();
    msg.textContent = '';
    toast(t('toastSaved'));
  }

  async function deleteEmployee() {
    var id = $('empId').value;
    if (!id) return;
    if (!confirm(t('confirmDelEmp'))) return;
    var ok = false;
    try { ok = await mgrRpc('admin_delete_employee', { p_id: id }); } catch (e) {}
    if (!ok) { $('empMsg').textContent = t('delFail'); return; }
    await reloadEmployees();
    renderClock();
    renderEmpList();
    resetEmpForm();
    toast(t('toastDeleted'));
  }

  /* ---------- 급여 ---------- */
  function setPeriod(type) {
    document.querySelectorAll('[data-period]').forEach(function (b) {
      b.classList.toggle('on', b.dataset.period === type);
    });
    var now = vancouverNow(), start, end;
    if (type === 'week') {
      var diff = (now.getDay() + 6) % 7;
      start = new Date(now); start.setDate(now.getDate() - diff);
      end = new Date(start); end.setDate(start.getDate() + 6);
    } else if (type === 'month') {
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    } else {
      start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      end = new Date(now.getFullYear(), now.getMonth(), 0);
    }
    $('payStart').value = fmtYMD(start);
    $('payEnd').value = fmtYMD(end);
    loadPayroll();
  }

  async function loadPayroll() {
    var start = $('payStart').value, end = $('payEnd').value;
    if (!start || !end) { toast(t('toastPickPeriod')); return; }
    if (!mgrToken) {
      payrollCache = { shifts: [], closeouts: [], start: start, end: end, computed: null };
      return;
    }
    var rows, cos;
    try {
      rows = await mgrRpc('admin_shifts', { p_from: start, p_to: end });
      cos = await mgrRpc('admin_closeouts', { p_from: start, p_to: end });
    } catch (e) { toast(t('toastPayrollFail')); return; }
    payrollCache = { shifts: rows || [], closeouts: cos || [], start: start, end: end, computed: null };
    tipTotalCents = null; tipAppCents = 0;
    payrollCache.computed = computePayroll(payrollCache.shifts, payrollCache.closeouts);
    renderPayroll();
  }

  /* ---------- BC 스탯 홀리데이 (전 직원 1.5배) ---------- */
  function fmtD(y, m, d) { return y + '-' + (m < 10 ? '0' : '') + m + '-' + (d < 10 ? '0' : '') + d; }
  function nthWeekday(y, m, wd, n) { /* wd: 1=월요일 · 그 달 n번째 wd의 날짜(일) */
    var first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
    return 1 + ((wd - first + 7) % 7) + (n - 1) * 7;
  }
  function easterSunday(y) { /* 부활절 일요일 [월, 일] */
    var a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4,
      f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3),
      h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4,
      l = (32 + 2 * e + 2 * i - h - k) % 7, mm = Math.floor((a + 11 * h + 22 * l) / 451);
    return [Math.floor((h + l - 7 * mm + 114) / 31), ((h + l - 7 * mm + 114) % 31) + 1];
  }
  function statHolidaySet(year) {
    var s = {};
    function add(m, d) { s[fmtD(year, m, d)] = true; }
    add(1, 1);                                    /* 신정 */
    add(2, nthWeekday(year, 2, 1, 3));            /* Family Day: 2월 셋째 월요일 */
    var es = easterSunday(year);                  /* Good Friday: 부활절 이틀 전 */
    var gf = new Date(Date.UTC(year, es[0] - 1, es[1])); gf.setUTCDate(gf.getUTCDate() - 2);
    s[fmtD(gf.getUTCFullYear(), gf.getUTCMonth() + 1, gf.getUTCDate())] = true;
    var may24 = new Date(Date.UTC(year, 4, 24));  /* Victoria Day: 5월 24일 이전 마지막 월요일 */
    add(5, 24 - ((may24.getUTCDay() + 6) % 7));
    add(7, 1);                                    /* Canada Day */
    add(8, nthWeekday(year, 8, 1, 1));            /* BC Day: 8월 첫째 월요일 */
    add(9, nthWeekday(year, 9, 1, 1));            /* Labour Day: 9월 첫째 월요일 */
    add(9, 30);                                   /* 진실과 화해의 날 */
    add(10, nthWeekday(year, 10, 1, 2));          /* 추수감사절: 10월 둘째 월요일 */
    add(11, 11);                                  /* Remembrance Day */
    add(12, 25);                                  /* 크리스마스 */
    return s;
  }
  var _statSets = {};
  function isStatHoliday(dateStr) {
    if (!dateStr) return false;
    var y = +dateStr.slice(0, 4);
    if (!_statSets[y]) _statSets[y] = statHolidaySet(y);
    return !!_statSets[y][dateStr];
  }

  /* ---------- 부스터 판정 (Jo 룰, 2026-10-20 최종) ----------
     기존 룰 유지 + 풀타임 부스터 추가 (합산):
     (a) 월–목 16:00 이후 시작 + 그날 서버 중 마지막 퇴근 + 20:30 이후 퇴근 (혼자 마감)
     (b) 본인 마감 정산 매출 $800 이상
     → (a)/(b) 중 하나라도 해당하면 그날 임금 전액 ×1.04 ×10%. 해당 없으면 저장된 수동 부스터.
     (c) 풀타임 부스터 (추가): 근무 입력에서 풀타임 체크 + 저녁 시작 시간을 넣으면
         저녁 시작~퇴근 구간 임금 ×1.04 ×10% 를 위에 더한다.
     스탯 홀리데이에는 부스터 전부 미적용 (1.5배로 대체, 중복 금지). 오너 본인은 대상 아님. */
  function isServerFloorShift(s) {
    var emp = s.employees;
    if (!emp || emp.role !== 'server') return false;
    /* 오너의 주방 근무(팁 없는 근무)는 서버 근무로 치지 않음 */
    if (emp.name === 'jun sik kim' && !(s.tips_cents > 0)) return false;
    return true;
  }
  function boosterApplies(s, dayShifts, closeouts) {
    if (!isServerFloorShift(s)) return false;
    if (s.employees.name === 'jun sik kim') return false; /* 오너 본인은 부스터 대상 아님 */
    if (isStatHoliday(s.work_date)) return false;
    /* (b) 매출 룰: 요일 무관, 본인 마감 매출 $800 이상 */
    var cos = closeouts || [];
    for (var i = 0; i < cos.length; i++) {
      var c = cos[i];
      if (c.employee_id === s.employee_id && c.work_date === s.work_date &&
          (c.total_sales_cents || 0) >= 80000) return true;
    }
    /* (a) 월–목 저녁 혼자 마감 룰 */
    var dow = new Date(s.work_date + 'T12:00:00').getDay();
    if (dow < 1 || dow > 4) return false;
    var ci = new Date(s.clock_in), co = new Date(s.clock_out);
    var inMin = ci.getHours() * 60 + ci.getMinutes();
    var outMin = co.getHours() * 60 + co.getMinutes();
    if (outMin <= inMin) outMin += 1440;
    if (inMin < 960) return false;   /* 16:00 이전 시작 제외 */
    if (outMin < 1230) return false; /* 20:30 이전 퇴근 제외 */
    var ds = dayShifts || [];
    for (var j = 0; j < ds.length; j++) {
      var o = ds[j];
      if (o.id === s.id || o.work_date !== s.work_date) continue;
      if (!isServerFloorShift(o)) continue;
      if (new Date(o.clock_out) > co) return false; /* 더 늦게 퇴근한 서버가 있으면 제외 */
    }
    return true;
  }
  function segmentBoosterCents(rateCents, eveningStartIso, clockOutIso) {
    var h = (new Date(clockOutIso) - new Date(eveningStartIso)) / 3600000;
    if (!(h > 0)) return 0;
    return Math.round(h * (rateCents || 0) * 1.04 * 0.10);
  }
  function fulltimeBoosterCents(s) {
    if (!s.is_fulltime || !s.evening_start || !s.employees) return 0;
    if (s.employees.name === 'jun sik kim') return 0; /* 오너 제외 */
    return segmentBoosterCents(s.employees.hourly_rate_cents, s.evening_start, s.clock_out);
  }
  function effectiveBoosterCents(s, dayShifts, closeouts) {
    if (isStatHoliday(s.work_date)) return 0;
    var base;
    if (s.employees && s.employees.role === 'server' &&
        boosterApplies(s, dayShifts, closeouts)) {
      var h = (new Date(s.clock_out) - new Date(s.clock_in)) / 3600000;
      if (h < 0) h = 0;
      base = Math.round(h * (s.employees.hourly_rate_cents || 0) * 1.04 * 0.10);
    } else {
      base = s.booster_cents || 0;
    }
    return base + fulltimeBoosterCents(s); /* 풀타임 부스터는 추가 합산 */
  }

  function computePayroll(shifts, closeouts) {
    var per = {}, serverTips = 0, kitchenHours = 0;
    /* 직원별·날짜별 팁: 근무 기록 팁 우선, 없는 날은 마감 정산에서 서버가 입력한 팁을 쓴다
       (Jo 룰 2026-10-20: 마감정산 팁으로 총팁·주방팁 계산; 이중 계산 방지) */
    var tipByKey = {}, tipUsed = {};
    shifts.forEach(function (s) {
      if (s.tips_cents) {
        var kk = s.employee_id + '|' + s.work_date;
        tipByKey[kk] = (tipByKey[kk] || 0) + s.tips_cents;
      }
    });
    (closeouts || []).forEach(function (c) {
      if (!c.tips_cents) return;
      /* 두 번째 서버가 있으면 정산 팁을 반반 분배 (Jay Kim 2026-10-23) */
      var targets = (c.employee_id2 && c.employee_id2 !== c.employee_id)
        ? [c.employee_id, c.employee_id2] : [c.employee_id];
      var half = Math.round(c.tips_cents / 2);
      targets.forEach(function (eid, i) {
        var kk = eid + '|' + c.work_date;
        if (!tipByKey[kk]) tipByKey[kk] = targets.length === 2 ? (i === 0 ? c.tips_cents - half : half) : c.tips_cents;
      });
    });
    shifts.forEach(function (s) {
      var emp = s.employees;
      if (!emp) return;
      var h = (new Date(s.clock_out) - new Date(s.clock_in)) / 3600000;
      if (h < 0) h = 0;
      if (!per[emp.id]) {
        per[emp.id] = { id: emp.id, name: emp.name, role: emp.role,
          rate: emp.hourly_rate_cents || 0, hours: 0, tips: 0, wage: 0, kshare: 0, kh: 0,
          booster: 0, holiday: 0, vacation: 0, total: 0 };
      }
      var tkey = s.employee_id + '|' + s.work_date;
      var sTips = tipUsed[tkey] ? 0 : (tipByKey[tkey] || 0);
      tipUsed[tkey] = true;
      per[emp.id].hours += h;
      per[emp.id].tips += sTips;
      per[emp.id].booster += effectiveBoosterCents(s, shifts, closeouts);
      /* 스탯 홀리데이 근무는 전 직원 1.5배: 추가 0.5배를 홀리데이 항목으로 자동 계산 (기존 수동 입력값 대체) */
      if (isStatHoliday(s.work_date)) per[emp.id].holiday += Math.round(h * (emp.hourly_rate_cents || 0) * 0.5);
      else per[emp.id].holiday += s.holiday_cents || 0;
      if (emp.role === 'server') serverTips += sTips;
      /* 주방 풀 분배용 시간: 주방 근무만 (Jo 룰 2026-10-20: 서버 근무는 주방팁 대상 아님 — 오너도 주방 기록 근무로만) */
      if (emp.role !== 'server') per[emp.id].kh += h;
    });
    var totalTips = (tipTotalCents != null) ? tipTotalCents : serverTips;
    var appTips = tipAppCents || 0;
    var base = Math.max(0, totalTips - appTips);
    /* 주방 풀 = 서버팁 ÷7×3 (서버팁이 전체 팁의 70% — Jo의 시트 방식) */
    var pool = Math.round(base * 3 / 7);
    var kitchenHours = 0;
    Object.keys(per).forEach(function (k) { kitchenHours += per[k].kh || 0; });
    var klist = Object.keys(per).map(function (k) { return per[k]; })
      .filter(function (p) { return (p.kh || 0) > 0; });
    var assigned = 0;
    klist.forEach(function (p, i) {
      if (kitchenHours > 0) {
        p.kshare = (i === klist.length - 1)
          ? pool - assigned
          : Math.round(pool * p.kh / kitchenHours);
        assigned += p.kshare;
      }
    });
    Object.keys(per).forEach(function (k) {
      var p = per[k];
      p.wage = Math.round(p.hours * p.rate);
      p.vacation = Math.round((p.wage + p.booster + p.holiday) * 0.04);
      p.total = p.wage + p.vacation + p.booster + p.holiday + p.tips + p.kshare;
    });
    return { rows: Object.keys(per).map(function (k) { return per[k]; }),
      serverTips: serverTips, pool: pool,
      totalTips: totalTips, appTips: appTips, base: base };
  }

  function renderPoolCalc(c) {
    var el = $('tipCalcLines');
    if (!el) return;
    var html =
      esc(t('poolServerTips')) + ': $' + dollars(c.totalTips) +
      (c.appTips > 0 ? ' − $' + dollars(c.appTips) + ' = <strong>$' + dollars(c.base) + '</strong>' : '') + '<br>' +
      esc(t('poolKitchenFormula')) + ': <strong>$' + dollars(c.pool) + '</strong> ' + esc(t('tipPoolNote')) + '<br>' +
      esc(t('poolGrandTotal')) + ': <strong>$' + dollars(c.base + c.pool) + '</strong>';
    el.innerHTML = html;
  }

  function onTipInput() {
    var tv = parseFloat($('tipTotalInput').value);
    var av = parseFloat($('tipAppInput').value);
    tipTotalCents = (!isNaN(tv) && tv > 0) ? Math.round(tv * 100) : 0;
    tipAppCents = (!isNaN(av) && av > 0) ? Math.round(av * 100) : 0;
    recomputeTips();
  }

  function recomputeTips() {
    payrollCache.computed = computePayroll(payrollCache.shifts, payrollCache.closeouts);
    renderPoolCalc(payrollCache.computed);
    renderTipTable(payrollCache.computed);
  }

  /* 오너 본인 급여 행은 오너 세션에서만 표시 (관리자 계정에는 숨김) */
  function hideOwnerRow(p) {
    return managerRole === 'owner' || p.name !== 'jun sik kim';
  }

  function renderTipTable(c) {
    // 팁 테이블: 서버(본인 팁) 위 / 주방(풀 분배) 아래 — Jo 시트 방식
    var showServer = payrollRoleFilter === 'all' || payrollRoleFilter === 'server';
    var showKitchen = payrollRoleFilter === 'all' || payrollRoleFilter === 'kitchen';
    var th = '<table class="pay"><tr><th>' + esc(t('thEmployee')) + '</th><th>' + esc(t('thRole')) +
      '</th><th>' + esc(t('thTips')) + '</th><th>' + esc(t('thKShare')) +
      '</th><th>' + esc(t('thTotal')) + '</th></tr>';
    function trow(name, role, tips, kshare) {
      return '<tr><td>' + esc(name) + '</td><td>' + esc(role) + '</td>' +
        '<td>$' + dollars(tips) + '</td><td>$' + dollars(kshare) + '</td>' +
        '<td><strong>$' + dollars(tips + kshare) + '</strong></td></tr>';
    }
    function sectionRow(label) {
      return '<tr class="tip-section"><td colspan="5">' + esc(label) + '</td></tr>';
    }
    var gT = 0, gK = 0;
    if (showServer) {
      th += sectionRow(t('servers'));
      var st = 0;
      c.rows.filter(function (p) { return p.role === 'server' && hideOwnerRow(p); })
        .sort(function (a, b) { return b.tips - a.tips; })
        .forEach(function (p) { st += p.tips; th += trow(p.name, roleName(p.role), p.tips, 0); });
      gT += st;
      th += '<tr class="total"><td>' + esc(t('calServerTips')) + '</td><td></td>' +
        '<td>$' + dollars(st) + '</td><td></td><td>$' + dollars(st) + '</td></tr>';
    }
    if (showKitchen) {
      th += sectionRow(t('kitchen'));
      var kt = 0;
      c.rows.filter(function (p) { return p.role !== 'server' && hideOwnerRow(p); })
        .sort(function (a, b) { return b.kshare - a.kshare; })
        .forEach(function (p) { kt += p.kshare; th += trow(p.name, roleName(p.role), 0, p.kshare); });
      /* 오너의 서버 기록에 쌓인 주방 몫만 별도 행으로 (주방 기록 행은 위 목록에 이미 표시 — 이중 계산 방지) */
      var owner = c.rows.filter(function (p) { return p.name === 'jun sik kim' && p.role === 'server'; })[0];
      if (owner && owner.kshare > 0 && hideOwnerRow(owner)) {
        kt += owner.kshare;
        th += trow(owner.name, roleName('kitchen'), 0, owner.kshare);
      }
      gK += kt;
      th += '<tr class="total"><td>' + esc(t('calKitchenTips')) + '</td><td></td>' +
        '<td></td><td>$' + dollars(kt) + '</td><td>$' + dollars(kt) + '</td></tr>';
    }
    th += '<tr class="total"><td>' + esc(t('total')) + '</td><td></td>' +
      '<td>$' + dollars(gT) + '</td>' +
      '<td>$' + dollars(gK) + '</td><td>$' + dollars(gT + gK) + '</td></tr></table>';
    $('tipTable').innerHTML = th;
  }

  function renderPayroll() {
    var c = payrollCache.computed;
    if (!c) return;
    /* 팁 풀: 서버 팁 합계 기준, 주방 풀 = 서버팁 ÷7×3 (Jo 시트 방식) */
    $('tipPoolBox').innerHTML =
      '<strong>' + esc(t('tipPoolTitle')) + '</strong>' +
      '<div class="tip-inputs">' +
      '<label>' + esc(t('tipPoolTotalTips')) +
      ' <input type="number" id="tipTotalInput" min="0" step="0.01" value="' + (c.totalTips / 100).toFixed(2) + '"></label>' +
      '<label>' + esc(t('tipPoolAppTips')) +
      ' <input type="number" id="tipAppInput" min="0" step="0.01" value="' + (c.appTips / 100).toFixed(2) + '"></label>' +
      '</div><div id="tipCalcLines"></div>';
    renderPoolCalc(c);
    $('tipTotalInput').addEventListener('input', onTipInput);
    $('tipAppInput').addEventListener('input', onTipInput);
    // 월급 테이블 (임금 + 휴가수당 + 보너스)
    var wrows = c.rows.filter(function (p) {
      return (payrollRoleFilter === 'all' || p.role === payrollRoleFilter) && hideOwnerRow(p);
    }).sort(function (a, b) { return b.wage - a.wage; });
    var bonusCols = showBonusDetail
      ? '<th>' + esc(t('thBooster')) + '</th><th>' + esc(t('thHoliday')) + '</th><th>' + esc(t('thBonus')) + '</th><th>' + esc(t('thVacation')) + '</th>'
      : '';
    var wh = '<table class="pay"><tr><th>' + esc(t('thEmployee')) + '</th><th>' + esc(t('thRole')) +
      '</th><th>' + esc(t('thHours')) + '</th><th>' + esc(t('thRate')) + '</th>' +
      '<th>' + esc(t('thWage')) + '</th>' + bonusCols +
      '<th>' + esc(t('thTotal')) + '</th></tr>';
    var tH = 0, tW = 0, tV = 0, tB = 0, tHl = 0, tBn = 0, tWT = 0;
    wrows.forEach(function (p) {
      var bTot = p.booster + p.holiday;
      var wTot = p.wage + p.vacation + bTot;
      tH += p.hours; tW += p.wage; tV += p.vacation; tB += p.booster; tHl += p.holiday; tBn += bTot; tWT += wTot;
      var bonusCells = showBonusDetail
        ? '<td>$' + dollars(p.booster) + '</td><td>$' + dollars(p.holiday) + '</td><td>$' + dollars(bTot) + '</td><td>$' + dollars(p.vacation) + '</td>'
        : '';
      wh += '<tr><td>' + esc(p.name) + '</td><td>' + esc(roleName(p.role)) + '</td>' +
        '<td>' + p.hours.toFixed(2) + '</td><td>$' + dollars(p.rate) + '</td>' +
        '<td>$' + dollars(p.wage) + '</td>' + bonusCells +
        '<td><strong>$' + dollars(wTot) + '</strong></td></tr>';
    });
    var bonusTotalCells = showBonusDetail
      ? '<td>$' + dollars(tB) + '</td><td>$' + dollars(tHl) + '</td><td>$' + dollars(tBn) + '</td><td>$' + dollars(tV) + '</td>'
      : '';
    wh += '<tr class="total"><td>' + esc(t('total')) + '</td><td></td><td>' + tH.toFixed(2) + '</td><td></td>' +
      '<td>$' + dollars(tW) + '</td>' + bonusTotalCells +
      '<td>$' + dollars(tWT) + '</td></tr></table>';
    $('wageTable').innerHTML = wh;
    renderTipTable(c);

    $('shiftList').innerHTML = payrollCache.shifts.map(function (s) {
      var emp = s.employees || {};
      return '<div class="shift-row"><span class="grow"><strong>' + esc(emp.name || '?') + '</strong> ' +
        fmtDateV(s.work_date) + ' ' + fmtTime(s.clock_in) + '–' + fmtTime(s.clock_out) +
        (s.tips_cents ? ' · ' + esc(t('tipsWord')) + ' $' + dollars(s.tips_cents) : '') + '</span>' +
        '<button class="btn btn-chip" data-shift="' + s.id + '">' + esc(t('edit')) + '</button></div>';
    }).join('') || '<p class="view-desc">' + esc(t('noShifts')) + '</p>';
    document.querySelectorAll('[data-shift]').forEach(function (b) {
      b.addEventListener('click', function () { openEditShift(b.dataset.shift); });
    });
  }

  var editShiftCur = null;
  function openEditShift(id) {
    var s = payrollCache.shifts.find(function (x) { return x.id === id; });
    if (!s) return;
    editShiftCur = s;
    $('editShiftId').value = s.id;
    $('editShiftDate').value = s.work_date;
    $('editShiftIn').value = fmtTime(s.clock_in);
    $('editShiftOut').value = fmtTime(s.clock_out);
    $('editShiftTips').value = s.tips_cents ? (s.tips_cents / 100).toFixed(2) : '';
    var isSrv = !!(s.employees && s.employees.role === 'server');
    $('editFulltimeRow').classList.toggle('hidden', !isSrv);
    $('editFulltime').checked = !!s.is_fulltime;
    $('editEveningStart').value = s.evening_start ? fmtTime(s.evening_start) : '';
    $('editEveningRow').classList.toggle('hidden', !(isSrv && s.is_fulltime));
    $('editShiftMsg').textContent = '';
    $('editShiftMsg').className = 'msg';
    openModal('editShiftModal');
  }

  async function saveEditedShift() {
    var id = $('editShiftId').value;
    var date = $('editShiftDate').value, ci = $('editShiftIn').value, co = $('editShiftOut').value;
    var msg = $('editShiftMsg');
    msg.className = 'msg';
    if (!date || !ci || !co) { msg.textContent = t('needAll'); return; }
    var ciN = normTime24(ci), coN = normTime24(co);
    if (!ciN || !coN) { msg.textContent = t('badTime'); return; }
    var inMs = toMs(date, ciN), outMs = toMs(date, coN);
    if (outMs <= inMs) outMs += 24 * 3600 * 1000;
    if (inMs > Date.now() + 120000 || outMs > Date.now() + 120000) { msg.textContent = t('futureTime'); return; }
    var tm = parseFloat($('editShiftTips').value);
    var upd = {
      work_date: date,
      clock_in: new Date(inMs).toISOString(),
      clock_out: new Date(outMs).toISOString(),
      tips_cents: (!isNaN(tm) && tm > 0) ? Math.round(tm * 100) : 0
    };
    /* 풀타임(서버): 저녁 시작 시간만 저장/해제 — 금액은 계산 때 합산 (저장된 수동 부스터는 건드리지 않음) */
    if (editShiftCur && editShiftCur.employees && editShiftCur.employees.role === 'server') {
      if ($('editFulltime').checked) {
        var evN = normTime24($('editEveningStart').value);
        if (!evN) { msg.textContent = t('badTime'); return; }
        var evMs = toMs(date, evN);
        if (evMs < inMs || evMs >= outMs) { msg.textContent = t('eveOrder'); return; }
        upd.is_fulltime = true;
        upd.evening_start = new Date(evMs).toISOString();
      } else if (editShiftCur.is_fulltime) {
        upd.is_fulltime = false;
        upd.evening_start = null;
      }
    }
    var okUp = false;
    try { okUp = await rpc('admin_update_shift', { p_token: mgrToken, p_id: id, p_row: upd }); } catch (e) {}
    if (!okUp) { msg.textContent = t('saveFail'); return; }
    closeModal('editShiftModal');
    toast(t('toastSaved'));
    loadPayroll();
  }

  async function deleteShift() {
    var id = $('editShiftId').value;
    if (!confirm(t('confirmDelShift'))) return;
    var okDel = false;
    try { okDel = await rpc('admin_delete_shift', { p_token: mgrToken, p_id: id }); } catch (e) {}
    if (!okDel) { $('editShiftMsg').textContent = t('delFail'); return; }
    closeModal('editShiftModal');
    toast(t('toastDeleted'));
    loadPayroll();
  }

  /* ---------- 마감 정산 (관리자 탭) ---------- */
  async function loadCloseouts() {
    var mv = $('coMonth').value;
    if (!mv) { toast(t('toastPickPeriod')); return; }
    var start = mv + '-01';
    var endD = new Date(+mv.slice(0, 4), +mv.slice(5, 7), 0);
    var end = fmtYMD(endD);
    try {
      var rows = await mgrRpc('admin_closeouts', { p_from: start, p_to: end });
      closeoutCache = { rows: rows || [], month: mv };
      renderCloseouts();
    } catch (e) {
      closeoutCache = { rows: [], month: mv };
      $('coList').innerHTML = '<p class="view-desc">' + esc(t('coNoData')) + '</p>';
      $('coSummary').innerHTML = '';
    }
  }

  function renderCloseouts() {
    var rows = closeoutCache.rows;
    if (!rows.length) {
      $('coList').innerHTML = '<p class="view-desc">' + esc(t('coNoData')) + '</p>';
      $('coSummary').innerHTML = '';
      return;
    }
    var tSales = 0, tCash = 0, tTips = 0, mism = 0;
    var html = '<table class="pay"><tr><th>' + esc(t('coThDate')) + '</th><th>' + esc(t('thEmployee')) +
      '</th><th>' + esc(t('coThTotalSales')) + '</th><th>' + esc(t('coThCash')) + '</th><th>' +
      esc(t('coThTips')) + '</th><th>' + esc(t('coThExpected')) + '</th><th>' + esc(t('coThCounted')) +
      '</th><th>' + esc(t('coThDiff')) + '</th><th></th></tr>';
    rows.forEach(function (r) {
      tSales += r.total_sales_cents || 0;
      tCash += r.cash_sales_cents || 0;
      tTips += r.tips_cents || 0;
      var d = r.diff_cents || 0;
      if (Math.abs(d) > 200) mism++;
      var dHtml = Math.abs(d) <= 200
        ? '<span class="diff-ok">' + esc(t('coMatch')) + '</span>'
        : '<span class="diff-bad">' + (d > 0 ? '+' : '') + '$' + dollars(d) + '</span>';
      html += '<tr><td>' + esc(fmtDateV(r.work_date)) + '</td><td>' +
        esc((r.employees && r.employees.name) || '?') + '</td><td>$' + dollars(r.total_sales_cents) +
        '</td><td>$' + dollars(r.cash_sales_cents) + '</td><td>$' + dollars(r.tips_cents) +
        '</td><td>$' + dollars(r.expected_cents) + '</td><td>$' + dollars(r.counted_cents) +
        '</td><td>' + dHtml + '</td>' +
        '<td class="row-actions"><button class="btn btn-chip" data-edit-co="' + r.id + '">' + esc(t('edit')) +
        '</button> <button class="btn btn-chip btn-danger" data-del-co="' + r.id + '">' + esc(t('del')) + '</button></td></tr>';
    });
    html += '</table>';
    $('coList').innerHTML = html;
    $('coList').querySelectorAll('[data-edit-co]').forEach(function (b) {
      b.addEventListener('click', function () { editCloseout(b.getAttribute('data-edit-co')); });
    });
    $('coList').querySelectorAll('[data-del-co]').forEach(function (b) {
      b.addEventListener('click', function () { deleteCloseout(b.getAttribute('data-del-co')); });
    });
    $('coSummary').innerHTML =
      '<h3>' + esc(t('coSummary')) + '</h3>' +
      '<div class="co-stat-grid">' +
      '<div class="co-stat"><div class="k">' + esc(t('coThTotalSales')) + '</div><div class="v">$' + dollars(tSales) + '</div></div>' +
      '<div class="co-stat"><div class="k">' + esc(t('coThCash')) + '</div><div class="v">$' + dollars(tCash) + '</div></div>' +
      '<div class="co-stat"><div class="k">' + esc(t('coThTips')) + '</div><div class="v">$' + dollars(tTips) + '</div></div>' +
      '<div class="co-stat"><div class="k">' + esc(t('coMismatch')) + '</div><div class="v">' + mism + '</div></div>' +
      '</div>';
  }

  /* 마감 정산 수정/삭제 (관리자 권한) */
  function editCloseout(id) {
    var r = (closeoutCache.rows || []).find(function (x) { return x.id === id; });
    if (!r) return;
    fillCloseoutForm(r);
    coReturnToToday = false;
    openModal('closeoutModal');
  }

  async function deleteCloseout(id) {
    if (!confirm(t('confirmDelCo'))) return;
    var okDc = false;
    try { okDc = await rpc('admin_delete_closeout', { p_token: mgrToken, p_id: id }); } catch (e) {}
    if (!okDc) { toast(t('delFail')); return; }
    toast(t('toastDeleted'));
    loadCloseouts();
  }

  /* ---------- CSV ---------- */
  function csvCell(v) {
    return '"' + String(v).replace(/"/g, '""') + '"';
  }

  function exportCSV() {
    var c = payrollCache.computed;
    if (!c || !c.rows.length) { toast(t('toastNoCsv')); return; }
    var lines = ['\ufeff' + t('csvDateRange') + ',' + payrollCache.start + ' ~ ' + payrollCache.end];
    lines.push([t('thEmployee'), t('thRole'), t('thHours'),
      t('thRate') + ' ($)', t('thWage') + ' ($)',
      t('thBooster') + ' ($)', t('thHoliday') + ' ($)', t('thBonus') + ' ($)', t('thVacation') + ' ($)',
      t('thTips') + ' ($)', t('thKShare') + ' ($)', t('thTotal') + ' ($)'].map(csvCell).join(','));
    c.rows.forEach(function (p) {
      lines.push([p.name, roleName(p.role), p.hours.toFixed(2),
        dollars(p.rate), dollars(p.wage),
        dollars(p.booster), dollars(p.holiday), dollars(p.booster + p.holiday), dollars(p.vacation),
        dollars(p.tips), dollars(p.kshare), dollars(p.total)
      ].map(csvCell).join(','));
    });
    var blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'jimoco-payroll-' + payrollCache.start + '_' + payrollCache.end + '.csv';
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
  }

  /* ---------- 관리자 비밀번호 변경 ---------- */
  /* ---------- 비밀번호 관리 (오너 전용: 조회 + 변경) ---------- */
  async function getSetting(key) {
    try {
      var v = await rpc('view_secret', { p_token: mgrToken, p_key: key });
      return v || '';
    } catch (e) { return ''; }
  }

  async function loadPwManager() {
    if (managerRole !== 'owner') return;
    /* 현재 비밀번호는 보기 버튼을 눌러야 표시됨 */
    $('viewScreenPw').value = '';
    $('viewOwnerPw').value = '';
    $('viewMasterPin').value = '';
    ['showScreenPwBtn', 'showOwnerPwBtn', 'showMasterPinBtn'].forEach(function (id) {
      var b = $(id);
      if (b) { b.textContent = t('show'); }
    });
    ['viewScreenPw', 'viewOwnerPw', 'viewMasterPin'].forEach(function (id) {
      var w = $(id).closest('.pw-wrap');
      if (w) w.classList.add('hidden');
    });
    $('viewOwnerUser').value = await getSetting('owner_username');
    renderManagerList();
    renderStaffPinList();
  }

  /* 보기 버튼: 현재 시스템 비밀번호 표시/숨기기 */
  function bindPwViewer(btnId, key, inputId) {
    var btn = $(btnId);
    if (!btn) return;
    btn.addEventListener('click', async function () {
      var inp = $(inputId);
      var wrap = inp.closest('.pw-wrap');
      if (inp.value) {
        inp.value = ''; inp.type = 'password';
        wrap.classList.add('hidden');
        btn.textContent = t('show');
      } else {
        inp.value = await getSetting(key);
        wrap.classList.remove('hidden');
        btn.textContent = t('hide');
      }
    });
  }

  async function saveOwnerUsername() {
    var msg = $('pinMsg');
    msg.className = 'msg';
    var user = $('viewOwnerUser').value.trim();
    if (!user) { msg.textContent = t('needUsername'); return; }
    var ok = false;
    try { ok = await rpc('change_secret', { p_token: mgrToken, p_key: 'owner_username', p_value: user }); } catch (e) {}
    if (!ok) { msg.textContent = t('saveFail'); return; }
    msg.textContent = t('pwChanged');
    msg.className = 'msg ok';
  }

  function renderStaffPinList() {
    var list = employees.filter(function (e) { return e.active !== false; });
    var html = '';
    list.forEach(function (e) {
      var iid = 'staffPin_' + e.id;
      html += '<div class="staff-pin-row"><span class="grow">' + esc(e.name) + '</span>' +
        '<span class="pw-wrap"><input type="password" id="' + iid + '" maxlength="8" inputmode="numeric" autocomplete="new-password" value="' +
        esc(e.pin || '') + '" placeholder="' + esc(t('empPinPh') || '') + '">' +
        '<button type="button" class="pw-eye" data-eye-for="' + iid + '" tabindex="-1" aria-label="show">👁</button></span>' +
        '<button class="btn btn-chip" data-save-pin="' + e.id + '">' + esc(t('save')) + '</button></div>';
    });
    $('staffPinList').innerHTML = html || '<p class="view-desc">' + esc(t('noShifts')) + '</p>';
    $('staffPinList').querySelectorAll('[data-eye-for]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var inp = $(btn.getAttribute('data-eye-for'));
        if (!inp) return;
        var show = inp.type === 'password';
        inp.type = show ? 'text' : 'password';
        btn.textContent = show ? '🙈' : '👁';
      });
    });
    $('staffPinList').querySelectorAll('[data-save-pin]').forEach(function (btn) {
      btn.addEventListener('click', function () { saveStaffPin(btn.getAttribute('data-save-pin')); });
    });
  }

  async function saveStaffPin(empId) {
    var inp = $('staffPin_' + empId);
    var msg = $('staffPinMsg');
    msg.className = 'msg';
    var pin = inp.value.trim();
    if (pin && !/^\d{4,8}$/.test(pin)) { msg.textContent = t('badPin'); return; }
    var ok = false;
    try { ok = await mgrRpc('admin_set_pin', { p_emp: empId, p_pin: pin }); } catch (e) {}
    if (!ok) { msg.textContent = t('saveFail'); return; }
    var emp = employees.find(function (e) { return e.id === empId; });
    if (emp) { emp.pin = pin || null; emp.has_pin = !!pin; }
    msg.textContent = t('pwChanged');
    msg.className = 'msg ok';
  }

  async function changePw(key, newId, new2Id, msgId, afterFn) {
    var np = $(newId).value.trim(), np2 = $(new2Id).value.trim();
    var msg = $(msgId);
    msg.className = 'msg';
    if (np.length < 4) { msg.textContent = t('pwShort'); return; }
    if (np !== np2) { msg.textContent = t('pwMismatch'); return; }
    var ok = false;
    try { ok = await rpc('change_secret', { p_token: mgrToken, p_key: key, p_value: np }); } catch (e) {}
    if (!ok) { msg.textContent = t('changeFail'); return; }
    if (afterFn) afterFn(np);
    $(newId).value = ''; $(new2Id).value = '';
    msg.textContent = t('pwChanged');
    msg.className = 'msg ok';
    loadPwManager();
  }

  function changeOwnerPassword() {
    changePw('manager_pin', 'newPin', 'newPin2', 'pinMsg');
  }

  /* 마스터 PIN 변경 (오너 전용; 모든 직원 기록·수정 게이트 통과용) */
  async function changeMasterPin() {
    var np = $('newMasterPin').value.trim();
    var msg = $('masterPinMsg');
    msg.className = 'msg';
    if (!/^\d{4,8}$/.test(np)) { msg.textContent = t('badPin'); return; }
    var ok = false;
    try { ok = await rpc('change_secret', { p_token: mgrToken, p_key: 'master_pin', p_value: np }); } catch (e) {}
    if (!ok) { msg.textContent = t('changeFail'); return; }
    $('newMasterPin').value = '';
    msg.textContent = t('pwChanged');
    msg.className = 'msg ok';
    loadPwManager();
  }

  /* ---------- 관리자 권한 계정 관리 (오너 전용, 여러 명 가능) ---------- */
  function mgrRowHtml(m, isPending) {
    var pwId = 'mgrPw_' + m.id, emId = 'mgrEmail_' + m.id;
    var h = '<div class="mgr-card">';
    if (isPending) {
      h += '<div class="mgr-name">' + esc(m.username) + '</div>';
    } else if (managerRole === 'owner') {
      /* 평소에는 아이디만 표시; 오너만 눌러서 이메일·비밀번호·저장·삭제 펼칠 수 있음 (Jo 요청 2026-10-20) */
      h += '<div class="mgr-name mgr-toggle" data-toggle-mgr="' + m.id + '">' +
        esc(m.username) + '<span class="mgr-chev">▸</span></div>' +
        '<div class="mgr-body" id="mgrBody_' + m.id + '" hidden>';
    } else {
      /* 오너가 아닌 세션에서는 아이디만 보이고 상세는 펼칠 수 없음 */
      h += '<div class="mgr-name">' + esc(m.username) + '</div><div>';
    }
    if (isPending) {
      if (m.email) h += '<div class="muted small">' + esc(m.email) + '</div>';
      h += '<div class="btn-row"><button class="btn btn-chip" data-approve-mgr="' + m.id + '">' +
        esc(t('approve')) + '</button>' +
        '<button class="btn btn-chip btn-danger" data-del-mgr="' + m.id + '" data-username="' +
        esc(m.username) + '">' + esc(t('reject')) + '</button></div>';
    } else {
      h += '<label class="mgr-field"><span>' + esc(t('email')) + '</span>' +
        '<input type="email" id="' + emId + '" autocomplete="off" value="' +
        esc(m.email || '') + '" placeholder="' + esc(t('mgrEmailPh')) + '"></label>' +
        '<label class="mgr-field"><span>' + esc(t('password')) + '</span>' +
        '<span class="pw-wrap"><input type="password" id="' + pwId + '" autocomplete="new-password" value="" placeholder="' + esc(t('mgrPwEditPh')) + '">' +
        '<button type="button" class="pw-eye" data-eye-for="' + pwId +
        '" tabindex="-1" aria-label="show">👁</button></span></label>' +
        '<div class="btn-row"><button class="btn btn-chip" data-save-mgr="' + m.id + '">' +
        esc(t('save')) + '</button>' +
        '<button class="btn btn-chip btn-danger" data-del-mgr="' + m.id + '" data-username="' +
        esc(m.username) + '">' + esc(t('del')) + '</button></div></div>';
    }
    return h + '</div>';
  }

  async function renderManagerList() {
    var box = $('managerList');
    var msg = $('mgrMsg');
    msg.className = 'msg';
    var rows = null;
    try { rows = await rpc('admin_managers', { p_token: mgrToken }); } catch (e) {}
    if (!rows) { box.innerHTML = '<p class="msg">' + esc(t('loadFail')) + '</p>'; return; }
    var pending = rows.filter(function (m) { return !m.active; });
    var active = rows.filter(function (m) { return m.active; });
    var html = '';
    if (pending.length) {
      html += '<h4 class="mgr-sub">' + esc(t('pendingTitle')) + ' (' + pending.length + ')</h4>';
      pending.forEach(function (m) { html += mgrRowHtml(m, true); });
    }
    if (active.length) {
      if (pending.length) html += '<h4 class="mgr-sub">' + esc(t('mgrAcctTitle')) + '</h4>';
      active.forEach(function (m) { html += mgrRowHtml(m, false); });
    }
    box.innerHTML = html || '<p class="view-desc">' + esc(t('noManagers')) + '</p>';
    box.querySelectorAll('[data-toggle-mgr]').forEach(function (head) {
      head.addEventListener('click', function () {
        var body = $('mgrBody_' + head.getAttribute('data-toggle-mgr'));
        if (!body) return;
        var open = body.hidden;
        body.hidden = !open;
        var chev = head.querySelector('.mgr-chev');
        if (chev) chev.textContent = open ? '▾' : '▸';
      });
    });
    box.querySelectorAll('[data-eye-for]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var inp = $(btn.getAttribute('data-eye-for'));
        if (!inp) return;
        var show = inp.type === 'password';
        inp.type = show ? 'text' : 'password';
        btn.textContent = show ? '🙈' : '👁';
      });
    });
    box.querySelectorAll('[data-save-mgr]').forEach(function (btn) {
      btn.addEventListener('click', function () { saveManager(btn.getAttribute('data-save-mgr')); });
    });
    box.querySelectorAll('[data-approve-mgr]').forEach(function (btn) {
      btn.addEventListener('click', function () { approveManager(btn.getAttribute('data-approve-mgr')); });
    });
    box.querySelectorAll('[data-del-mgr]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        delManager(btn.getAttribute('data-del-mgr'), btn.getAttribute('data-username'));
      });
    });
  }

  /* 매니저 비밀번호 규칙: 8자 이상 + 대문자 + 특수문자 */
  function validManagerPw(pw) {
    return pw.length >= 8 && /[A-Z]/.test(pw) && /[^A-Za-z0-9]/.test(pw);
  }

  function validEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }

  async function addManager() {
    var user = $('newMgrUser').value.trim();
    var email = $('newMgrEmail').value.trim();
    var pw = $('newMgrPw').value.trim();
    var msg = $('mgrMsg');
    msg.className = 'msg';
    if (!user) { msg.textContent = t('needUsername'); return; }
    if (email && !validEmail(email)) { msg.textContent = t('badEmail'); return; }
    if (!validManagerPw(pw)) { msg.textContent = t('mgrPwRule'); return; }
    var r = null;
    try {
      r = await mgrRpc('admin_add_manager', {
        p_username: user, p_email: email, p_password: pw
      });
    } catch (e) {}
    if (!r || !r.ok) {
      msg.textContent = (r && r.dup) ? t('mgrUserExists') : t('saveFail');
      return;
    }
    $('newMgrUser').value = ''; $('newMgrEmail').value = ''; $('newMgrPw').value = '';
    msg.textContent = t('pwChanged');
    msg.className = 'msg ok';
    renderManagerList();
  }

  /* 관리자 계정 저장: 이메일 + (입력된 경우만) 비밀번호 변경 */
  async function saveManager(id) {
    var pwInp = $('mgrPw_' + id);
    var emInp = $('mgrEmail_' + id);
    var msg = $('mgrMsg');
    msg.className = 'msg';
    var pw = pwInp.value.trim();
    var email = emInp.value.trim();
    if (pw && !validManagerPw(pw)) { msg.textContent = t('mgrPwRule'); return; }
    if (email && !validEmail(email)) { msg.textContent = t('badEmail'); return; }
    var ok = false;
    try {
      ok = await mgrRpc('admin_update_manager', { p_id: id, p_email: email, p_password: pw });
    } catch (e) {}
    if (!ok) { msg.textContent = t('saveFail'); return; }
    msg.textContent = t('pwChanged');
    msg.className = 'msg ok';
    renderManagerList();
  }

  async function approveManager(id) {
    var msg = $('mgrMsg');
    var ok = false;
    try { ok = await mgrRpc('admin_set_manager_active', { p_id: id, p_active: true }); } catch (e) {}
    if (!ok) { msg.textContent = t('saveFail'); msg.className = 'msg'; return; }
    msg.textContent = t('approved');
    msg.className = 'msg ok';
    renderManagerList();
  }

  async function delManager(id, username) {
    if (!confirm(t('confirmDelMgr') + '\n' + username)) return;
    var msg = $('mgrMsg');
    var ok = false;
    try { ok = await mgrRpc('admin_delete_manager', { p_id: id }); } catch (e) {}
    if (!ok) { msg.textContent = t('delFail'); msg.className = 'msg'; return; }
    renderManagerList();
  }

  function changeScreenPassword() {
    changePw('screen_password', 'newScreenPw', 'newScreenPw2', 'screenPwMsg');
  }

  document.addEventListener('DOMContentLoaded', init);
})();
