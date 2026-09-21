// ==========================================================================
// Mobile navigation toggle
// The button flips aria-expanded and a class on the nav; CSS handles the
// actual show/hide animation (see the max-width: 640px block in styles.css).
// ==========================================================================
const navToggle = document.getElementById('nav-toggle');
const primaryNav = document.getElementById('primary-nav');

function closeNav() {
  primaryNav.classList.remove('is-open');
  navToggle.setAttribute('aria-expanded', 'false');
}

function toggleNav() {
  const isOpen = primaryNav.classList.toggle('is-open');
  navToggle.setAttribute('aria-expanded', String(isOpen));
}

navToggle.addEventListener('click', toggleNav);

// Close the mobile menu once a nav link is used, so the panel doesn't
// stay open over the section the user just navigated to.
primaryNav.querySelectorAll('a').forEach((link) => {
  link.addEventListener('click', closeNav);
});

// Close the menu on resize back up to desktop width, so it doesn't get
// stuck open if someone rotates a tablet or resizes the window.
window.addEventListener('resize', () => {
  if (window.innerWidth > 640) closeNav();
});

// ==========================================================================
// Signup form
// No backend here — this is a static prototype, so we just confirm the
// input locally rather than pretending to submit somewhere.
// ==========================================================================
const signupForm = document.getElementById('signup-form');
const formStatus = document.getElementById('form-status');

signupForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const email = document.getElementById('email').value.trim();

  if (!email) return;

  formStatus.textContent = `You're on the list — we'll email ${email} when tracks open.`;
  signupForm.reset();
});
