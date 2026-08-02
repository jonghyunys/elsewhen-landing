// ==========================================================================
// 히어로 데모용 스토리 데이터
// 노드 키 → { text, choices:[{label, next}] } 또는 { text, ending:true }
// 나중에 내용만 바꾸고 싶을 때 이 객체만 수정하면 됨
// ==========================================================================
const story = {
  start: {
    text: '그가 뒤돌아섰다. 지금 붙잡지 않으면, 다시는 볼 수 없을 것 같았다.',
    choices: [
      { label: '그를 붙잡는다', next: 'hold' },
      { label: '그냥 보낸다', next: 'let' }
    ]
  },
  hold: {
    text: '손목을 잡았다. 그가 멈췄다. 돌아본 얼굴엔 내가 모르는 표정이 있었다.',
    choices: [
      { label: '이유를 묻는다', next: 'ask' },
      { label: '아무 말도 하지 않는다', next: 'silent' }
    ]
  },
  let: {
    text: '발소리가 멀어졌다. 문이 닫히고 나서야, 그가 남기고 간 것이 보였다.',
    choices: [
      { label: '그것을 열어본다', next: 'open' },
      { label: '그대로 둔다', next: 'leave' }
    ]
  },
  ask: { text: '"왜 그랬어?" 그가 웃었다. 처음 듣는 대답이 돌아왔다.', ending: true },
  silent: { text: '말하지 않아도 알았다. 우리는 같은 것을 후회하고 있었다.', ending: true },
  open: { text: '봉투 안에는 3년 전 날짜의 편지가 있었다. 내 이름이 적혀 있었다.', ending: true },
  leave: { text: '그날 이후로 그 방에 들어가지 않았다. 그것은 아직 거기 있다.', ending: true }
};

// ==========================================================================
// 스크롤 등장 애니메이션 (IntersectionObserver)
// main 안의 각 section에 reveal 클래스를 부여하고, 화면에 들어오면
// is-visible을 붙여 CSS 트랜지션으로 페이드인시킨다.
// ==========================================================================
(function () {
  const sections = document.querySelectorAll('main section');

  sections.forEach((section) => section.classList.add('reveal'));

  const observer = new IntersectionObserver(
    (entries, obs) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          obs.unobserve(entry.target); // 한 번 나타난 뒤에는 다시 관찰할 필요 없음
        }
      });
    },
    { threshold: 0.15 }
  );

  sections.forEach((section) => observer.observe(section));
})();

// ==========================================================================
// 사전등록 모달: 열기/닫기 + 포커스 트랩
// ==========================================================================
(function () {
  const modal = document.getElementById('signup-modal');
  const modalContent = modal.querySelector('.modal-content');
  const openTriggers = document.querySelectorAll('[data-modal-trigger]');
  const closeTriggers = modal.querySelectorAll('[data-modal-close]');

  // 모달이 열려 있는 동안 스크린리더 가상 탐색이 배경으로 새지 않도록 격리할 대상
  const backgroundLandmarks = document.querySelectorAll('header, main, footer');

  let lastFocusedElement = null; // 모달을 열기 전 포커스를 되돌려주기 위해 저장

  // 모달 안에서 Tab으로 순환할 포커스 가능한 요소들
  function getFocusableElements() {
    return modalContent.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
  }

  function openModal(event) {
    if (event) event.preventDefault(); // CTA 버튼의 href="#cta" 앵커 이동 방지

    lastFocusedElement = document.activeElement;
    modal.hidden = false;
    backgroundLandmarks.forEach((el) => { el.inert = true; });
    document.addEventListener('keydown', handleKeydown);

    const focusable = getFocusableElements();
    if (focusable.length) focusable[0].focus();
  }

  function closeModal() {
    modal.hidden = true;
    backgroundLandmarks.forEach((el) => { el.inert = false; });
    document.removeEventListener('keydown', handleKeydown);
    if (lastFocusedElement) lastFocusedElement.focus(); // 원래 포커스 위치로 복귀
  }

  // ESC로 닫기 + 모달 안에서만 Tab 포커스가 순환되도록 트랩
  function handleKeydown(event) {
    if (event.key === 'Escape') {
      closeModal();
      return;
    }

    if (event.key === 'Tab') {
      const focusable = Array.from(getFocusableElements());
      if (!focusable.length) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  }

  openTriggers.forEach((trigger) => trigger.addEventListener('click', openModal));
  closeTriggers.forEach((trigger) => trigger.addEventListener('click', closeModal)); // 오버레이 클릭 + 닫기 버튼

  // 사전등록 폼 제출 시 페이지 새로고침 없이 모달만 닫음 (백엔드 미연결 상태)
  const signupForm = document.getElementById('signup-form');
  signupForm.addEventListener('submit', (event) => {
    event.preventDefault();
    closeModal();
  });
})();

// ==========================================================================
// 히어로 읽기 화면 데모: 사용자가 직접 선택지를 골라 진행하는 인터랙티브 데모.
// story 데이터를 기반으로 노드를 렌더링하고, 선택할 때마다 다음 노드로 이동한다.
// ==========================================================================
(function () {
  const card = document.querySelector('.reader-card');
  if (!card) return;

  const textContainer = card.querySelector('.reader-card-text');
  const typedEl = card.querySelector('.reader-card-typed');
  const historyEl = card.querySelector('.reader-card-history');
  const scrollEl = card.querySelector('.reader-card-scroll');
  const choicesEl = card.querySelector('.reader-card-choices');
  const branchSvg = card.querySelector('.reader-card-branch');
  const edgePaths = branchSvg ? branchSvg.querySelectorAll('[data-edge]') : [];
  const nodeDots = branchSvg ? branchSvg.querySelectorAll('[data-node]') : [];

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const TYPE_SPEED = 40; // 한 글자당 ms
  const DISMISS_DELAY = 500; // 선택 직후 → 다음 노드 렌더까지 대기 시간
  const CHOICE_STAGGER = 150; // 새 선택지가 순차적으로 나타나는 간격

  let path = ['start']; // 지금까지 지나온 노드 키
  let typingTimer = null;

  function currentKey() {
    return path[path.length - 1];
  }

  // 지나온 경로에 해당하는 간선/노드만 강조색으로 표시
  function updateBranchMap() {
    edgePaths.forEach((edgePath) => {
      const [from, to] = edgePath.dataset.edge.split('-');
      const fromIndex = path.indexOf(from);
      const isActive = fromIndex !== -1 && path[fromIndex + 1] === to;
      if (isActive) edgePath.classList.add('is-active');
    });
    nodeDots.forEach((dot) => {
      if (path.includes(dot.dataset.node)) dot.classList.add('is-active');
    });
  }

  function resetBranchMap() {
    edgePaths.forEach((edgePath) => edgePath.classList.remove('is-active'));
    nodeDots.forEach((dot) => dot.classList.remove('is-active'));
  }

  // 현재 본문을 히스토리로 밀어 올리며 흐리게 만듦 ("걸어온 경로" 느낌)
  function settleCurrentText() {
    const text = typedEl.textContent;
    if (!text) return;

    const entry = document.createElement('p');
    entry.className = 'reader-card-history-entry';
    entry.textContent = text;
    historyEl.appendChild(entry);

    if (prefersReducedMotion) {
      entry.classList.add('is-settled');
    } else {
      requestAnimationFrame(() => entry.classList.add('is-settled'));
    }
  }

  function scrollToLatest() {
    if (scrollEl) scrollEl.scrollTop = scrollEl.scrollHeight;
  }

  function typeText(text, onDone) {
    if (prefersReducedMotion) {
      typedEl.textContent = text;
      if (onDone) onDone();
      return;
    }

    let charIndex = 0;
    typingTimer = setInterval(() => {
      charIndex += 1;
      typedEl.textContent = text.slice(0, charIndex);
      scrollToLatest();
      if (charIndex >= text.length) {
        clearInterval(typingTimer);
        if (onDone) onDone();
      }
    }, TYPE_SPEED);
  }

  function openSignupModal() {
    // 실제 모달 오픈 로직은 위 모달 IIFE에 이미 있으므로, 기존 트리거를 재사용
    const trigger = document.querySelector('.hero-content [data-modal-trigger]');
    if (trigger) trigger.click();
  }

  function restart() {
    path = ['start'];
    resetBranchMap();
    historyEl.innerHTML = '';
    renderNode();
  }

  function makeChoiceButton(label, extraClass) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = extraClass ? `reader-choice ${extraClass}` : 'reader-choice';
    btn.textContent = label;
    return btn;
  }

  function revealChoiceButtons(buttons) {
    buttons.forEach((btn, index) => {
      choicesEl.appendChild(btn);
      if (prefersReducedMotion) {
        btn.classList.add('is-visible');
      } else {
        setTimeout(() => btn.classList.add('is-visible'), CHOICE_STAGGER * (index + 1));
      }
    });
  }

  function renderChoices(node) {
    choicesEl.innerHTML = '';

    if (node.ending) {
      const restartBtn = makeChoiceButton('다른 선택을 해본다');
      restartBtn.addEventListener('click', restart);

      const readMoreBtn = makeChoiceButton('더 읽어보기', 'reader-choice--primary');
      readMoreBtn.addEventListener('click', openSignupModal);

      revealChoiceButtons([restartBtn, readMoreBtn]);
      return;
    }

    const buttons = node.choices.map((choice) => {
      const btn = makeChoiceButton(choice.label);
      btn.dataset.next = choice.next;
      btn.addEventListener('click', () => handleChoiceClick(btn, choice.next));
      return btn;
    });

    revealChoiceButtons(buttons);
  }

  function handleChoiceClick(selectedBtn, nextKey) {
    if (typingTimer) clearInterval(typingTimer);

    // 선택한 것만 잠깐 강조되고, 나머지는 그 자리에서 사라짐
    const buttons = Array.from(choicesEl.querySelectorAll('.reader-choice'));
    buttons.forEach((btn) => {
      btn.disabled = true;
      if (btn === selectedBtn) {
        btn.classList.add('is-selected');
      } else {
        btn.classList.add('is-dismissed');
      }
    });

    settleCurrentText();

    const proceed = () => {
      choicesEl.innerHTML = '';
      path.push(nextKey);
      updateBranchMap();
      renderNode();
    };

    if (prefersReducedMotion) {
      proceed();
    } else {
      setTimeout(proceed, DISMISS_DELAY);
    }
  }

  function renderNode() {
    const node = story[currentKey()];

    typedEl.textContent = '';
    textContainer.classList.remove('is-visible');

    const startTyping = () => {
      textContainer.classList.add('is-visible');
      typeText(node.text, () => renderChoices(node));
    };

    if (prefersReducedMotion) {
      startTyping();
    } else {
      requestAnimationFrame(startTyping);
    }
  }

  renderNode();
})();

// ==========================================================================
// 헤더 섹션 네비게이션: 스크롤 시 배경 전환, 활성 섹션 표시, 모바일 햄버거 메뉴
// ==========================================================================
(function () {
  const header = document.querySelector('header');
  const navLinks = document.getElementById('nav-links');
  const navToggle = document.querySelector('.nav-toggle');
  if (!header || !navLinks || !navToggle) return;

  const links = navLinks.querySelectorAll('.nav-link');
  const mobileQuery = window.matchMedia('(max-width: 768px)');

  // 스크롤을 시작하면 헤더 배경에 blur + 반투명 배경 적용
  function updateHeaderScrollState() {
    header.classList.toggle('is-scrolled', window.scrollY > 0);
  }
  updateHeaderScrollState();
  window.addEventListener('scroll', updateHeaderScrollState, { passive: true });

  // 모바일 전체 화면 메뉴 열기/닫기
  function openMenu() {
    navLinks.classList.add('is-open');
    navLinks.inert = false;
    navToggle.setAttribute('aria-expanded', 'true');
    navToggle.setAttribute('aria-label', '메뉴 닫기');
    document.addEventListener('keydown', handleMenuKeydown);
  }

  function closeMenu() {
    navLinks.classList.remove('is-open');
    navToggle.setAttribute('aria-expanded', 'false');
    navToggle.setAttribute('aria-label', '메뉴 열기');
    document.removeEventListener('keydown', handleMenuKeydown);
    if (mobileQuery.matches) navLinks.inert = true; // 데스크탑에서는 항상 상호작용 가능해야 하므로 제외
  }

  function handleMenuKeydown(event) {
    if (event.key === 'Escape') closeMenu();
  }

  navToggle.addEventListener('click', () => {
    if (navLinks.classList.contains('is-open')) {
      closeMenu();
    } else {
      openMenu();
    }
  });

  // 메뉴 항목 클릭 시 자동으로 닫힘 (실제 이동은 브라우저 기본 앵커 동작 + scroll-behavior가 처리)
  links.forEach((link) => {
    link.addEventListener('click', () => {
      if (navLinks.classList.contains('is-open')) closeMenu();
    });
  });

  // 데스크탑 ↔ 모바일 폭 전환 시 메뉴 상태 정리
  function handleViewportChange(event) {
    if (event.matches) {
      navLinks.inert = true; // 모바일: 닫힌 상태이므로 상호작용 차단
    } else {
      navLinks.classList.remove('is-open');
      navLinks.inert = false; // 데스크탑: 항상 보이고 상호작용 가능
      navToggle.setAttribute('aria-expanded', 'false');
      navToggle.setAttribute('aria-label', '메뉴 열기');
    }
  }
  mobileQuery.addEventListener('change', handleViewportChange);
  handleViewportChange(mobileQuery); // 초기 상태 설정

  // 현재 화면에 보이는 섹션에 맞춰 메뉴 활성 표시
  const sectionIds = ['problem', 'how', 'features', 'cta'];
  const sections = sectionIds.map((id) => document.getElementById(id)).filter(Boolean);

  function setActiveLink(id) {
    links.forEach((link) => {
      const isActive = link.getAttribute('href') === '#' + id;
      link.classList.toggle('is-active', isActive);
      if (isActive) {
        link.setAttribute('aria-current', 'true');
      } else {
        link.removeAttribute('aria-current');
      }
    });
  }

  const sectionObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) setActiveLink(entry.target.id);
      });
    },
    { rootMargin: '-40% 0px -55% 0px', threshold: 0 } // 화면 중앙 부근의 얇은 띠에서 교차 여부만 확인
  );

  sections.forEach((section) => sectionObserver.observe(section));
})();
