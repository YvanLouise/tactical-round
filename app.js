"use strict";

const readSlides = () => [...document.querySelectorAll(".tactic-trigger")].map((button) => ({
  image: button.dataset.image,
  alt: button.dataset.imageAlt,
  label: button.dataset.label,
}));
let slides = readSlides();

const galleryImage = document.querySelector("#gallery-image");
const galleryLabel = document.querySelector("#gallery-label");
const galleryCurrent = document.querySelector("#gallery-current");
const galleryEnlarge = document.querySelector("#gallery-enlarge");
const tacticButtons = [...document.querySelectorAll(".tactic-trigger")];
let activeSlide = 0;

function selectSlide(index) {
  activeSlide = (index + slides.length) % slides.length;
  const slide = slides[activeSlide];
  galleryImage.src = slide.image;
  galleryImage.alt = slide.alt;
  galleryLabel.textContent = slide.label;
  galleryEnlarge.href = slide.image;
  galleryEnlarge.dataset.caption = `${slide.label} · 开发版本实机`;
  galleryCurrent.textContent = String(activeSlide + 1).padStart(2, "0");
  tacticButtons.forEach((button, buttonIndex) => {
    const selected = buttonIndex === activeSlide;
    button.setAttribute("aria-expanded", String(selected));
    button.closest(".tactic").classList.toggle("is-active", selected);
    document.getElementById(button.getAttribute("aria-controls")).hidden = !selected;
  });
}

tacticButtons.forEach((button) => {
  button.addEventListener("click", () => selectSlide(Number(button.dataset.slide)));
});
document.querySelector(".gallery-previous").addEventListener("click", () => selectSlide(activeSlide - 1));
document.querySelector(".gallery-next").addEventListener("click", () => selectSlide(activeSlide + 1));
window.addEventListener("website-content-updated", () => {
  slides = readSlides();
  selectSlide(activeSlide);
});

const menuToggle = document.querySelector(".menu-toggle");
const navigation = document.querySelector("#main-nav");
function setMenu(open) {
  navigation.classList.toggle("is-open", open);
  menuToggle.setAttribute("aria-expanded", String(open));
  menuToggle.setAttribute("aria-label", open ? "关闭导航" : "打开导航");
  menuToggle.querySelector("use").setAttribute("href", open ? "#close" : "#menu");
}
menuToggle.addEventListener("click", () => setMenu(menuToggle.getAttribute("aria-expanded") !== "true"));
navigation.querySelectorAll("a").forEach((link) => link.addEventListener("click", () => setMenu(false)));
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && menuToggle.getAttribute("aria-expanded") === "true") {
    setMenu(false);
    menuToggle.focus();
  }
});
window.matchMedia("(min-width: 981px)").addEventListener("change", (event) => {
  if (event.matches) setMenu(false);
});

const openingDialog = document.querySelector("#opening-dialog");
const openingVideo = document.querySelector("#opening-video");
const watchButton = document.querySelector("#watch-opening");
watchButton.addEventListener("click", () => {
  openingDialog.showModal();
  document.body.classList.add("dialog-open");
  openingVideo.currentTime = 0;
  document.querySelector("#video-caption").textContent = "原版标志与标题动画 · 8.3 秒 · 无声片段";
  openingVideo.play().catch(() => {
    document.querySelector("#video-caption").textContent = "点击播放器的播放按钮观看 · 游戏原版开场 · 无声片段";
  });
});
document.querySelector(".close-dialog").addEventListener("click", () => openingDialog.close());
openingDialog.addEventListener("click", (event) => {
  if (event.target !== openingDialog) return;
  const bounds = openingDialog.getBoundingClientRect();
  if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) openingDialog.close();
});
openingDialog.addEventListener("close", () => {
  openingVideo.pause();
  document.body.classList.remove("dialog-open");
  watchButton.focus();
});
openingVideo.addEventListener("error", () => {
  document.querySelector("#video-caption").textContent = "视频暂时无法播放，请稍后重试。";
});

const imageDialog = document.querySelector("#image-dialog");
let imageTrigger = null;
document.querySelectorAll("[data-lightbox]").forEach((link) => {
  link.addEventListener("click", (event) => {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    imageTrigger = link;
    const expandedImage = document.querySelector("#expanded-image");
    expandedImage.src = link.href;
    expandedImage.alt = link.querySelector("img").alt;
    document.querySelector("#image-title").textContent = link.dataset.caption;
    document.querySelector("#image-original").href = link.href;
    imageDialog.showModal();
    document.body.classList.add("dialog-open");
  });
});
document.querySelector(".close-image").addEventListener("click", () => imageDialog.close());
imageDialog.addEventListener("click", (event) => {
  if (event.target !== imageDialog) return;
  const bounds = imageDialog.getBoundingClientRect();
  if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) imageDialog.close();
});
imageDialog.addEventListener("close", () => {
  document.body.classList.remove("dialog-open");
  imageTrigger?.focus({ preventScroll: true });
});
document.querySelector(".release-link").addEventListener("click", () => {
  document.querySelector("#release").open = true;
});

if ("IntersectionObserver" in window) {
  const navLinks = [...navigation.querySelectorAll("a")];
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      navLinks.forEach((link) => {
        const current = link.hash === `#${entry.target.id}`;
        link.classList.toggle("is-current", current);
        if (current) link.setAttribute("aria-current", "location");
        else link.removeAttribute("aria-current");
      });
    }
  }, { rootMargin: "-10% 0px -55% 0px", threshold: 0 });
  navLinks.forEach((link) => observer.observe(document.querySelector(link.hash)));
}
