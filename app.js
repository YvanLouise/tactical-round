"use strict";

const slides = [
  {
    image: "./assets/battle.webp",
    alt: "实际战场：围绕路线部署多种建筑，迎战迟滞守望者。",
    label: "游戏实机画面",
  },
  {
    image: "./assets/enemies.webp",
    alt: "游戏实机画面：首次遇到敌人时，查看几何敌人的特性与应对提示。",
    label: "认识几何敌人",
  },
  {
    image: "./assets/challenge.webp",
    alt: "游戏实机画面：自动回合模式中，战场按建筑和敌人行动阶段依次推进。",
    label: "掌控回合节奏",
  },
];

const galleryImage = document.querySelector("#gallery-image");
const galleryLabel = document.querySelector("#gallery-label");
const galleryCurrent = document.querySelector("#gallery-current");
const tacticButtons = [...document.querySelectorAll(".tactic-trigger")];
let activeSlide = 0;

function selectSlide(index) {
  activeSlide = (index + slides.length) % slides.length;
  const slide = slides[activeSlide];
  galleryImage.src = slide.image;
  galleryImage.alt = slide.alt;
  galleryLabel.textContent = slide.label;
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
window.matchMedia("(min-width: 761px)").addEventListener("change", (event) => {
  if (event.matches) setMenu(false);
});

const openingDialog = document.querySelector("#opening-dialog");
const openingVideo = document.querySelector("#opening-video");
const watchButton = document.querySelector("#watch-opening");
watchButton.addEventListener("click", () => {
  openingDialog.showModal();
  document.body.classList.add("dialog-open");
  openingVideo.currentTime = 0;
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
  document.querySelectorAll("#gameplay, #world, #about").forEach((section) => observer.observe(section));
}
