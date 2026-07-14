const REFERRAL_URL = "https://trk.ppdu.ru/click?uid=311211&oid=2304&erid=CQH36pWzJqVGXC5oLP8WVVNCNqJmbhiUPijGiu4zpwPd7G";

const canvas = document.querySelector("#routeCanvas");
const ctx = canvas.getContext("2d");
const earnedCounter = document.querySelector("#earnedCounter");
const orderCounter = document.querySelector("#orderCounter");
const averageCounter = document.querySelector("#averageCounter");
const phoneEarned = document.querySelector("#phoneEarned");
const lastOrder = document.querySelector("#lastOrder");
const orderNumber = document.querySelector("#orderNumber");
const orderList = document.querySelector("#orderList");
const progressLine = document.querySelector("#progressLine");
const shiftTimer = document.querySelector("#shiftTimer");
const orderNameElement = document.querySelector(".order-card b");
const phoneElement = document.querySelector(".phone");
const phoneWrap = document.querySelector(".phone-wrap");

let width = 0;
let height = 0;
let dpr = 1;
let frame = 0;
let earned = 3254;
let orders = 8;
let currentOrder = 1855;
let shiftMinutes = 148;
let dotState = true;
let animationFrame = null;

// Активные заказы на карте
let ordersOnMap = [];
let particles = [];

const distances = [120, 180, 230, 280, 310, 150, 200, 260, 340];
const orderAmounts = [320, 390, 460, 320, 510, 540, 430, 380, 470];
const orderNames = ["Ресторан", "Кафе", "Суши", "Пиццерия", "Бургерная"];

// Позиция телефона и phone-wrap на canvas
let phoneRect = { x: 0, y: 0, w: 0, h: 0 };
let wrapRect = { x: 0, y: 0, w: 0, h: 0 };

// Расширенная область для размещения уведомлений (в пределах phone-wrap + небольшой отступ)
const EXPAND_MARGIN = 0.15; // 15% расширение за пределы phone-wrap

function formatNumber(value) {
    return new Intl.NumberFormat("ru-RU").format(Math.round(value));
}

function setReferralLinks() {
    for (const link of document.querySelectorAll(".js-referral-link")) {
        link.href = REFERRAL_URL;
    }
}

function animateValue(element, from, to, duration = 420) {
    const start = performance.now();

    function tick(now) {
        const progress = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        element.textContent = formatNumber(from + (to - from) * eased);
        if (progress < 1) requestAnimationFrame(tick);
    }

    requestAnimationFrame(tick);
}

function updateStats(amount) {
    const previousEarned = earned;
    earned += amount;
    orders += 1;
    currentOrder += 1;

    animateValue(earnedCounter, previousEarned, earned);
    animateValue(phoneEarned, previousEarned, earned);
    orderCounter.textContent = formatNumber(orders);
    averageCounter.textContent = formatNumber(earned / orders);
    lastOrder.textContent = formatNumber(amount);
    orderNumber.textContent = currentOrder;

    const nameIndex = currentOrder % orderNames.length;
    orderNameElement.textContent = orderNames[nameIndex] + " · заказ #" + currentOrder;

    progressLine.style.width = `${Math.min(92, 28 + (earned % 2400) / 28)}%`;
    addOrder(amount);
}

function addOrder(amount) {
    const item = document.createElement("div");
    const nameIndex = currentOrder % orderNames.length;
    const name = orderNames[nameIndex];
    item.innerHTML = `
    <p><b>${name}</b><span>Готовится заказ #${currentOrder}</span></p>
    <strong>+${formatNumber(amount)} ₽</strong>
  `;
    orderList.prepend(item);

    while (orderList.children.length > 4) {
        orderList.lastElementChild.remove();
    }
}

// Создание частиц для эффекта "волны"
function createWaveParticles(x, y) {
    for (let i = 0; i < 10; i++) {
        const angle = (i / 10) * Math.PI * 2 + Math.random() * 0.3;
        const speed = 0.5 + Math.random() * 1.5;
        particles.push({
            x: x,
            y: y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            life: 1,
            radius: 1 + Math.random() * 2,
            color: `rgba(184, 255, 44, ${0.3 + Math.random() * 0.3})`
        });
    }
}

function generateOrderOnMap() {
    if (!wrapRect || wrapRect.w === 0 || !width || !height) return;

    // Получаем границы phone-wrap с расширением
    const expandX = wrapRect.w * EXPAND_MARGIN;
    const expandY = wrapRect.h * EXPAND_MARGIN;

    const leftX = Math.max(0, wrapRect.x - expandX);
    const rightX = Math.min(width, wrapRect.x + wrapRect.w + expandX);
    const topY = Math.max(0, wrapRect.y - expandY);
    const bottomY = Math.min(height, wrapRect.y + wrapRect.h + expandY);

    // Размер уведомления
    const notifWidth = 140;
    const notifHeight = 44;

    let attempts = 0;
    let x, y;
    let validPosition = false;

    while (!validPosition && attempts < 50) {
        // Случайная позиция в пределах расширенной области
        x = leftX + Math.random() * (rightX - leftX);
        y = topY + Math.random() * (bottomY - topY);

        // Проверяем, что уведомление не перекрывается с телефоном
        const centerX = phoneRect.x + phoneRect.w / 2;
        const centerY = phoneRect.y + phoneRect.h / 2;
        const dx = x - centerX;
        const dy = y - centerY;
        const distFromPhone = Math.sqrt(dx * dx + dy * dy);

        // Минимальное расстояние от телефона
        const minDist = Math.max(phoneRect.w, phoneRect.h) * 0.5 + 20;

        // Проверяем, что уведомление полностью в пределах области
        const inBounds = x - notifWidth/2 > leftX &&
            x + notifWidth/2 < rightX &&
            y - notifHeight/2 > topY &&
            y + notifHeight/2 < bottomY;

        // Проверяем, что не перекрывается с другими уведомлениями
        let overlap = false;
        for (const existing of ordersOnMap) {
            const dx2 = x - existing.x;
            const dy2 = y - existing.y;
            const dist = Math.sqrt(dx2 * dx2 + dy2 * dy2);
            if (dist < 70) {
                overlap = true;
                break;
            }
        }

        if (distFromPhone > minDist && inBounds && !overlap) {
            validPosition = true;
        }
        attempts++;
    }

    // Если не нашли позицию, используем последнюю
    if (!validPosition) {
        x = leftX + Math.random() * (rightX - leftX);
        y = topY + Math.random() * (bottomY - topY);
    }

    const dist = distances[Math.floor(Math.random() * distances.length)];
    const amount = orderAmounts[Math.floor(Math.random() * orderAmounts.length)];
    const nameIndex = Math.floor(Math.random() * orderNames.length);

    const order = {
        x: x,
        y: y,
        distance: dist,
        amount: amount,
        name: orderNames[nameIndex],
        life: 0,
        phase: Math.random() * Math.PI * 2,
        age: 0,
        maxAge: 6 + Math.random() * 3,
        state: 'appearing',
        width: notifWidth,
        height: notifHeight
    };

    ordersOnMap.push(order);
    createWaveParticles(x, y);

    // Ограничиваем количество заказов
    if (ordersOnMap.length > 4) {
        const oldest = ordersOnMap.reduce((a, b) => a.age > b.age ? a : b);
        oldest.state = 'disappearing';
    }
}

function tickOrders() {
    const amount = orderAmounts[Math.floor(Math.random() * orderAmounts.length)];
    updateStats(amount);
    generateOrderOnMap();
}

function updateTimer() {
    shiftMinutes += 1;
    const hours = String(Math.floor(shiftMinutes / 60)).padStart(2, "0");
    const minutes = String(shiftMinutes % 60).padStart(2, "0");
    shiftTimer.textContent = `${hours}:${minutes}`;
}

function toggleDot() {
    const dot = document.querySelector(".dot");
    if (dot) {
        dotState = !dotState;
        dot.style.opacity = dotState ? "1" : "0.3";
    }
}

function resizeCanvas() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    width = rect.width;
    height = rect.height;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    updatePositions();
}

function updatePositions() {
    // Обновляем позицию телефона
    if (phoneElement) {
        const rect = phoneElement.getBoundingClientRect();
        const canvasRect = canvas.getBoundingClientRect();
        phoneRect = {
            x: rect.left - canvasRect.left,
            y: rect.top - canvasRect.top,
            w: rect.width,
            h: rect.height
        };
    }

    // Обновляем позицию phone-wrap
    if (phoneWrap) {
        const rect = phoneWrap.getBoundingClientRect();
        const canvasRect = canvas.getBoundingClientRect();
        wrapRect = {
            x: rect.left - canvasRect.left,
            y: rect.top - canvasRect.top,
            w: rect.width,
            h: rect.height
        };
    }
}

// Рисуем сетку карты (только в пределах phone-wrap)
function drawMapGrid() {
    if (!wrapRect || wrapRect.w === 0) return;

    ctx.save();
    ctx.globalAlpha = 0.06;
    ctx.strokeStyle = "rgba(7, 18, 13, 0.12)";
    ctx.lineWidth = 1;

    // Рисуем сетку только в пределах phone-wrap
    const startX = Math.max(0, wrapRect.x);
    const endX = Math.min(width, wrapRect.x + wrapRect.w);
    const startY = Math.max(0, wrapRect.y);
    const endY = Math.min(height, wrapRect.y + wrapRect.h);

    const gridSize = 35;
    for (let x = startX; x < endX; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, startY);
        ctx.lineTo(x, endY);
        ctx.stroke();
    }
    for (let y = startY; y < endY; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(startX, y);
        ctx.lineTo(endX, y);
        ctx.stroke();
    }
    ctx.restore();

    // Рамка phone-wrap (пунктирная)
    ctx.save();
    ctx.globalAlpha = 0.08;
    ctx.strokeStyle = "#b8ff2c";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 8]);
    ctx.strokeRect(wrapRect.x, wrapRect.y, wrapRect.w, wrapRect.h);
    ctx.setLineDash([]);
    ctx.restore();

    // Пульсирующий круг вокруг телефона
    if (phoneRect && phoneRect.w > 0) {
        const centerX = phoneRect.x + phoneRect.w / 2;
        const centerY = phoneRect.y + phoneRect.h / 2;
        const maxRadius = Math.max(phoneRect.w, phoneRect.h) * 0.9;
        const pulseRadius = maxRadius * (0.5 + Math.sin(frame * 0.02) * 0.15);

        ctx.save();
        ctx.globalAlpha = 0.04;
        ctx.fillStyle = "#b8ff2c";
        ctx.beginPath();
        ctx.arc(centerX, centerY, pulseRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

function drawOrdersOnMap() {
    // Обновляем частицы
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.03;
        p.life -= 0.015;
        p.radius *= 0.98;
        if (p.life <= 0) {
            particles.splice(i, 1);
        }
    }

    // Рисуем частицы
    for (const p of particles) {
        ctx.save();
        ctx.globalAlpha = p.life * 0.5;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    // Рисуем уведомления
    for (const order of ordersOnMap) {
        order.age += 0.016;

        // Анимация появления/исчезновения
        if (order.state === 'appearing') {
            order.life += 0.04;
            if (order.life >= 1) {
                order.life = 1;
                order.state = 'active';
            }
        } else if (order.state === 'disappearing') {
            order.life -= 0.025;
            if (order.life <= 0) {
                order.life = 0;
                order.state = 'dead';
                continue;
            }
        } else if (order.state === 'active') {
            if (order.age > order.maxAge) {
                order.state = 'disappearing';
                createWaveParticles(order.x, order.y);
            }
        }

        const x = order.x;
        const y = order.y;
        const alpha = order.life;
        const scale = order.life;

        // Эффект появления - масштабирование
        const currentWidth = order.width * (0.3 + 0.7 * scale);
        const currentHeight = order.height * (0.3 + 0.7 * scale);

        ctx.save();
        ctx.globalAlpha = alpha * 0.9;

        // Линия к уведомлению от телефона
        if (phoneRect && phoneRect.w > 0) {
            const centerX = phoneRect.x + phoneRect.w / 2;
            const centerY = phoneRect.y + phoneRect.h / 2;
            const dx = x - centerX;
            const dy = y - centerY;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist > 20) {
                const startX = centerX + (dx / dist) * (phoneRect.w / 2 + 15);
                const startY = centerY + (dy / dist) * (phoneRect.h / 2 + 15);

                ctx.setLineDash([3, 5]);
                ctx.strokeStyle = `rgba(184, 255, 44, ${0.1 * alpha})`;
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.moveTo(startX, startY);
                ctx.lineTo(x, y);
                ctx.stroke();
                ctx.setLineDash([]);
            }
        }

        // Тень уведомления
        ctx.shadowColor = "rgba(0, 0, 0, 0.06)";
        ctx.shadowBlur = 12;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 3;

        // Прямоугольник уведомления с белым фоном и прозрачностью
        const rectX = x - currentWidth / 2;
        const rectY = y - currentHeight / 2;
        const borderRadius = 8;

        // Белый фон с прозрачностью 50%
        ctx.fillStyle = `rgba(255, 255, 255, ${0.5 * alpha})`;
        ctx.shadowColor = "rgba(0, 0, 0, 0.08)";
        ctx.shadowBlur = 15;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 4;

        // Рисуем прямоугольник со скругленными углами
        ctx.beginPath();
        ctx.moveTo(rectX + borderRadius, rectY);
        ctx.lineTo(rectX + currentWidth - borderRadius, rectY);
        ctx.quadraticCurveTo(rectX + currentWidth, rectY, rectX + currentWidth, rectY + borderRadius);
        ctx.lineTo(rectX + currentWidth, rectY + currentHeight - borderRadius);
        ctx.quadraticCurveTo(rectX + currentWidth, rectY + currentHeight, rectX + currentWidth - borderRadius, rectY + currentHeight);
        ctx.lineTo(rectX + borderRadius, rectY + currentHeight);
        ctx.quadraticCurveTo(rectX, rectY + currentHeight, rectX, rectY + currentHeight - borderRadius);
        ctx.lineTo(rectX, rectY + borderRadius);
        ctx.quadraticCurveTo(rectX, rectY, rectX + borderRadius, rectY);
        ctx.closePath();
        ctx.fill();

        // Рамка уведомления
        ctx.shadowBlur = 0;
        ctx.strokeStyle = `rgba(184, 255, 44, ${0.25 * alpha})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(rectX + borderRadius, rectY);
        ctx.lineTo(rectX + currentWidth - borderRadius, rectY);
        ctx.quadraticCurveTo(rectX + currentWidth, rectY, rectX + currentWidth, rectY + borderRadius);
        ctx.lineTo(rectX + currentWidth, rectY + currentHeight - borderRadius);
        ctx.quadraticCurveTo(rectX + currentWidth, rectY + currentHeight, rectX + currentWidth - borderRadius, rectY + currentHeight);
        ctx.lineTo(rectX + borderRadius, rectY + currentHeight);
        ctx.quadraticCurveTo(rectX, rectY + currentHeight, rectX, rectY + currentHeight - borderRadius);
        ctx.lineTo(rectX, rectY + borderRadius);
        ctx.quadraticCurveTo(rectX, rectY, rectX + borderRadius, rectY);
        ctx.closePath();
        ctx.stroke();

        // Маленький индикатор сверху (цветная полоска)
        const indicatorWidth = currentWidth * 0.35;
        const indicatorX = x - indicatorWidth / 2;
        ctx.fillStyle = `rgba(184, 255, 44, ${0.5 * alpha})`;
        ctx.shadowColor = "rgba(184, 255, 44, 0.1)";
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.roundRect(indicatorX, rectY + 2, indicatorWidth, 2.5, 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        // Текст уведомления - название
        ctx.shadowBlur = 0;
        ctx.fillStyle = `rgba(7, 18, 13, ${0.85 * alpha})`;
        ctx.font = "bold 11px Inter, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        // Обрезаем название если слишком длинное
        let nameText = order.name;
        if (nameText.length > 12) {
            nameText = nameText.substring(0, 10) + "…";
        }
        ctx.fillText("📍 " + nameText, x, y - 5);

        // Текст уведомления - расстояние и сумма
        ctx.fillStyle = `rgba(7, 18, 13, ${0.55 * alpha})`;
        ctx.font = "9px Inter, sans-serif";
        ctx.fillText(order.distance + " м · +" + formatNumber(order.amount) + " ₽", x, y + 13);

        ctx.restore();
    }

    ordersOnMap = ordersOnMap.filter(order => order.state !== 'dead');

    // Индикатор "Поиск заказов..."
    if (ordersOnMap.length === 0 && frame % 120 < 60) {
        if (wrapRect && wrapRect.w > 0) {
            ctx.save();
            ctx.fillStyle = "rgba(7, 18, 13, 0.15)";
            ctx.font = "13px Inter, sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText("🔍 Поиск заказов...", wrapRect.x + wrapRect.w / 2, wrapRect.y + wrapRect.h / 2);
            ctx.restore();
        }
    }
}

// Polyfill для roundRect если браузер не поддерживает
if (!CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function(x, y, w, h, r) {
        if (r > w/2) r = w/2;
        if (r > h/2) r = h/2;
        this.moveTo(x + r, y);
        this.lineTo(x + w - r, y);
        this.quadraticCurveTo(x + w, y, x + w, y + r);
        this.lineTo(x + w, y + h - r);
        this.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        this.lineTo(x + r, y + h);
        this.quadraticCurveTo(x, y + h, x, y + h - r);
        this.lineTo(x, y + r);
        this.quadraticCurveTo(x, y, x + r, y);
        return this;
    };
}

function draw() {
    frame += 1;
    ctx.clearRect(0, 0, width, height);
    drawMapGrid();
    drawOrdersOnMap();
    animationFrame = requestAnimationFrame(draw);
}

function initOrders() {
    const nameIndex = currentOrder % orderNames.length;
    orderNameElement.textContent = orderNames[nameIndex] + " · заказ #" + currentOrder;

    earnedCounter.textContent = formatNumber(earned);
    phoneEarned.textContent = formatNumber(earned);
    orderCounter.textContent = formatNumber(orders);
    averageCounter.textContent = formatNumber(earned / orders);
    orderNumber.textContent = currentOrder;

    [520, 390, 460].forEach((amount) => {
        currentOrder += 1;
        addOrder(amount);
    });
}

// Инициализация
setReferralLinks();
initOrders();

// Ждем загрузки DOM
setTimeout(() => {
    resizeCanvas();
    draw();

    // Генерируем начальные заказы с задержкой
    setTimeout(() => {
        generateOrderOnMap();
        setTimeout(() => generateOrderOnMap(), 600);
        setTimeout(() => generateOrderOnMap(), 1200);
    }, 300);
}, 100);

// Таймеры
setInterval(tickOrders, 1200);
setInterval(updateTimer, 3200);
setInterval(toggleDot, 800);

// Обработка ресайза
let resizeTimeout;
window.addEventListener("resize", () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
        resizeCanvas();
        updatePositions();
    }, 200);
});

// Обновляем позиции при скролле
window.addEventListener("scroll", () => {
    updatePositions();
});

// Останавливаем анимацию при уходе с вкладки
document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
        if (animationFrame) {
            cancelAnimationFrame(animationFrame);
            animationFrame = null;
        }
    } else {
        if (!animationFrame) {
            draw();
        }
    }
});

// ========== Отслеживание кликов по кнопкам в Яндекс Метрике ==========

const METRIKA_ID = 110509647;

function sendMetrikaEvent(target, label = '') {
    if (typeof ym !== 'undefined') {
        try {
            ym(METRIKA_ID, 'reachGoal', target, { label });
            console.log(`[Metrika] ✅ Событие: ${target} (${label})`);
        } catch (e) {
            console.warn('[Metrika] ❌ Ошибка:', e);
        }
    }
}

// Отслеживаем все кнопки с классом js-referral-link
document.addEventListener('DOMContentLoaded', function() {
    const buttons = document.querySelectorAll('.js-referral-link');

    buttons.forEach((button, index) => {
        button.addEventListener('click', function() {
            // Определяем, какая это кнопка по ее положению на странице
            let buttonPosition = 'unknown';

            if (this.closest('.topbar')) {
                buttonPosition = 'topbar';
            } else if (this.closest('.hero')) {
                buttonPosition = 'hero';
            } else if (this.closest('.final-cta')) {
                buttonPosition = 'final_cta';
            } else if (this.closest('.quiz-modal')) {
                // Для модалки пропускаем, так как событие уже отправлено в showResult()
                return;
            }

            sendMetrikaEvent('referral_click', buttonPosition);
        });
    });
});

// ========== МОДАЛЬНОЕ ОКНО С КВИЗОМ ==========

const quizModalOverlay = document.getElementById('quizModalOverlay');
const quizModalClose = document.getElementById('quizModalClose');
let quizModalShown = false;
let quizModalTriggered = false;

// Функция открытия модалки
function openQuizModal() {
    if (quizModalShown) return;
    quizModalShown = true;
    quizModalTriggered = true;
    quizModalOverlay.classList.add('active');
    document.body.style.overflow = 'hidden'; // запрещаем скролл страницы
}

// Функция закрытия модалки
function closeQuizModal() {
    quizModalOverlay.classList.remove('active');
    document.body.style.overflow = '';
}

// Закрытие по кнопке ✕
quizModalClose.addEventListener('click', closeQuizModal);

// Закрытие по клику на оверлей (фон)
quizModalOverlay.addEventListener('click', function(e) {
    if (e.target === quizModalOverlay) {
        closeQuizModal();
    }
});

// Закрытие по Escape
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && quizModalOverlay.classList.contains('active')) {
        closeQuizModal();
    }
});

// ===== 1. ПОКАЗ ЧЕРЕЗ 6 СЕКУНД =====
setTimeout(function() {
    if (!quizModalTriggered) {
        openQuizModal();
    }
}, 12000);

// ===== 2. ПОКАЗ ПРИ ДОЛИСТЫВАНИИ ДО НИЗА =====
let scrollTriggered = false;

function checkScrollForQuiz() {
    if (quizModalShown || scrollTriggered) return;

    const scrollY = window.scrollY || window.pageYOffset;
    const windowHeight = window.innerHeight;
    const documentHeight = document.documentElement.scrollHeight;

    // Если доскроллили до низа (с погрешностью 50px)
    if (scrollY + windowHeight >= documentHeight - 50) {
        scrollTriggered = true;
        openQuizModal();
    }
}

// Слушаем скролл с троттлингом для производительности
let scrollTimeout;
window.addEventListener('scroll', function() {
    if (scrollTimeout) return;
    scrollTimeout = setTimeout(function() {
        checkScrollForQuiz();
        scrollTimeout = null;
    }, 200);
});

// Также проверяем при загрузке (вдруг страница уже проскроллена)
window.addEventListener('load', function() {
    setTimeout(checkScrollForQuiz, 500);
});

// ===== ИНИЦИАЛИЗАЦИЯ КВИЗА ВНУТРИ МОДАЛКИ =====
(function initQuizInModal() {
    const container = document.getElementById('quizContainer');
    if (!container) return;

    // Элементы
    const stepEl = document.getElementById('quizStep');
    const titleEl = document.getElementById('quizTitle');
    const subEl = document.getElementById('quizSub');
    const questions = document.querySelectorAll('.quiz-question');
    const nextBtn = document.getElementById('quizNextBtn');
    const resultBlock = document.getElementById('quizResult');
    const queueNumber = document.getElementById('queueNumber');
    const ageError = document.getElementById('ageError');

    // Элементы для ввода города
    const cityOptions = document.getElementById('cityOptions');
    let cityInput = null;

    // Состояние
    let currentQuestion = 1;
    const answers = {
        city: null,
        cityCustom: null,
        cityNormalized: null,
        age: null,
        delivery: null
    };

    // ===== СПИСОК ГОРОДОВ РОССИИ (основные) =====
    const CITIES_RU = [
        'Москва', 'Санкт-Петербург', 'Новосибирск', 'Екатеринбург', 'Казань',
        'Нижний Новгород', 'Челябинск', 'Самара', 'Омск', 'Ростов-на-Дону',
        'Уфа', 'Красноярск', 'Пермь', 'Воронеж', 'Волгоград',
        'Краснодар', 'Саратов', 'Тюмень', 'Тольятти', 'Ижевск',
        'Барнаул', 'Ульяновск', 'Иркутск', 'Хабаровск', 'Ярославль',
        'Владивосток', 'Махачкала', 'Томск', 'Оренбург', 'Кемерово',
        'Новокузнецк', 'Рязань', 'Астрахань', 'Набережные Челны', 'Пенза',
        'Липецк', 'Киров', 'Чебоксары', 'Калининград', 'Балашиха',
        'Курск', 'Ставрополь', 'Улан-Удэ', 'Сочи', 'Тверь',
        'Магнитогорск', 'Иваново', 'Брянск', 'Белгород', 'Сургут',
        'Владимир', 'Чита', 'Архангельск', 'Смоленск', 'Саранск',
        'Волжский', 'Якутск', 'Орёл', 'Мурманск', 'Подольск',
        'Тамбов', 'Грозный', 'Стерлитамак', 'Петрозаводск', 'Нижневартовск',
        'Кострома', 'Новороссийск', 'Химки', 'Йошкар-Ола', 'Мытищи',
        'Сыктывкар', 'Южно-Сахалинск', 'Комсомольск-на-Амуре', 'Нальчик', 'Элиста'
    ];

    // ===== ФУНКЦИИ НОРМАЛИЗАЦИИ ГОРОДА =====

    function capitalizeFirst(str) {
        if (!str || str.length === 0) return str;
        return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
    }

    function cleanCityString(str) {
        if (!str) return '';
        return str.trim().replace(/\s+/g, ' ');
    }

    function findClosestCity(input) {
        if (!input || input.length < 2) return null;

        const cleaned = cleanCityString(input);
        const normalized = capitalizeFirst(cleaned);

        const exactMatch = CITIES_RU.find(city =>
            city.toLowerCase() === normalized.toLowerCase()
        );
        if (exactMatch) return exactMatch;

        const startsWith = CITIES_RU.find(city =>
            city.toLowerCase().startsWith(normalized.toLowerCase()) &&
            city.length > normalized.length
        );
        if (startsWith) return startsWith;

        const contains = CITIES_RU.find(city =>
            city.toLowerCase().includes(normalized.toLowerCase()) &&
            city.length > 3
        );
        if (contains) return contains;

        let bestMatch = null;
        let bestDistance = Infinity;
        const threshold = 3;

        for (const city of CITIES_RU) {
            const distance = levenshteinDistance(
                normalized.toLowerCase(),
                city.toLowerCase()
            );

            if (distance < bestDistance && distance <= threshold) {
                bestDistance = distance;
                bestMatch = city;
            }
        }

        return bestMatch;
    }

    function levenshteinDistance(a, b) {
        const matrix = [];
        for (let i = 0; i <= b.length; i++) {
            matrix[i] = [i];
        }
        for (let j = 0; j <= a.length; j++) {
            matrix[0][j] = j;
        }
        for (let i = 1; i <= b.length; i++) {
            for (let j = 1; j <= a.length; j++) {
                if (b[i-1] === a[j-1]) {
                    matrix[i][j] = matrix[i-1][j-1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i-1][j-1] + 1,
                        matrix[i][j-1] + 1,
                        matrix[i-1][j] + 1
                    );
                }
            }
        }
        return matrix[b.length][a.length];
    }

    function normalizeCity(input) {
        if (!input) return null;

        const cleaned = cleanCityString(input);
        if (cleaned.length < 2) return null;

        const formatted = capitalizeFirst(cleaned);
        const found = findClosestCity(cleaned);

        return {
            original: input,
            formatted: formatted,
            normalized: found || formatted,
            found: !!found
        };
    }

    // Тексты для шагов
    const steps = {
        1: { title: 'Где вы находитесь?', sub: 'Это поможет подобрать ближайшие заказы' },
        2: { title: 'Сколько вам лет?', sub: 'Нам нужны курьеры от 18 лет' },
        3: { title: 'Какой способ передвижения предпочитаете?', sub: 'Выберите подходящий вариант' }
    };

    // ===== ФУНКЦИЯ ОБНОВЛЕНИЯ ШАГА С ЖИРНЫМ СТИЛЕМ =====
    function updateStep() {
        questions.forEach(q => q.classList.remove('active'));
        const target = document.querySelector(`.quiz-question[data-question="${currentQuestion}"]`);
        if (target) target.classList.add('active');

        const stepData = steps[currentQuestion];
        if (stepData) {
            titleEl.textContent = stepData.title;
            subEl.textContent = stepData.sub;
        }

        // Жирный шаг
        stepEl.innerHTML = `<strong style="font-weight: 900; font-size: inherit;">${currentQuestion}/3</strong>`;

        if (ageError) ageError.style.display = 'none';

        nextBtn.disabled = true;
        nextBtn.classList.remove('active');

        if (currentQuestion === 3) {
            nextBtn.textContent = 'Продолжить';
        } else {
            nextBtn.textContent = 'Продолжить';
        }

        if (resultBlock) resultBlock.classList.remove('show');
        resultBlock.style.display = 'none';

        if (currentQuestion === 1) {
            if (answers.city === 'Другой') {
                showCityInput();
            } else {
                removeCityInput();
            }
        } else {
            removeCityInput();
        }
    }

    function createCityInput() {
        if (cityInput) {
            cityInput.remove();
            cityInput = null;
        }

        const wrapper = document.createElement('div');
        wrapper.style.cssText = `
            width: 100%;
            margin-top: 10px;
            padding: 0 4px;
        `;

        const input = document.createElement('input');
        input.type = 'text';
        input.placeholder = 'Введите ваш город...';
        input.autocomplete = 'off';
        input.style.cssText = `
            width: 100%;
            padding: 12px 16px;
            border: 2px solid var(--black);
            border-radius: 10px;
            font-size: 15px;
            font-family: inherit;
            background: var(--white);
            color: var(--ink);
            outline: none;
            transition: border-color 0.2s ease, box-shadow 0.2s ease;
            box-shadow: 2px 2px 0 rgba(7, 18, 13, 0.1);
        `;

        input.addEventListener('focus', function() {
            this.style.borderColor = '#b8ff2c';
            this.style.boxShadow = '4px 4px 0 rgba(7, 18, 13, 0.2), 0 0 0 3px rgba(184, 255, 44, 0.3)';
        });

        input.addEventListener('blur', function() {
            this.style.borderColor = 'var(--black)';
            this.style.boxShadow = '2px 2px 0 rgba(7, 18, 13, 0.1)';
        });

        input.addEventListener('input', function() {
            const rawValue = this.value.trim();

            if (rawValue.length > 0) {
                answers.city = 'Другой';
                answers.cityCustom = rawValue;

                const normalized = normalizeCity(rawValue);
                if (normalized) {
                    answers.cityNormalized = normalized;
                } else {
                    answers.cityNormalized = null;
                }
            } else {
                answers.city = null;
                answers.cityCustom = null;
                answers.cityNormalized = null;
            }
            checkCanProceed();
        });

        wrapper.appendChild(input);
        cityInput = wrapper;
        return wrapper;
    }

    function showCityInput() {
        const firstQuestion = document.querySelector('.quiz-question[data-question="1"]');
        if (!firstQuestion) return;

        let existingWrapper = firstQuestion.querySelector('.city-input-wrapper');
        if (existingWrapper) {
            existingWrapper.style.display = 'block';
            const input = existingWrapper.querySelector('input');
            if (input) {
                input.value = answers.cityCustom || '';
                if (input.value.trim().length > 0) {
                    checkCanProceed();
                }
            }
            return;
        }

        const wrapper = createCityInput();
        wrapper.classList.add('city-input-wrapper');
        firstQuestion.appendChild(wrapper);

        setTimeout(() => {
            const input = wrapper.querySelector('input');
            if (input) input.focus();
        }, 100);
    }

    function removeCityInput() {
        const firstQuestion = document.querySelector('.quiz-question[data-question="1"]');
        if (!firstQuestion) return;

        const existing = firstQuestion.querySelector('.city-input-wrapper');
        if (existing) {
            existing.remove();
        }
        cityInput = null;
    }

    function checkCanProceed() {
        let can = false;

        if (currentQuestion === 1) {
            if (answers.city === 'Другой') {
                can = answers.cityCustom && answers.cityCustom.trim().length > 0;
            } else {
                can = !!answers.city;
            }
        }

        if (currentQuestion === 2 && answers.age) {
            const ageValue = answers.age;
            if (['18-25', '26-35', '36-45', '46+'].includes(ageValue)) {
                can = true;
                if (ageError) ageError.style.display = 'none';
            } else {
                can = false;
                if (ageError) ageError.style.display = 'block';
            }
        }

        if (currentQuestion === 3 && answers.delivery) {
            can = true;
        }

        if (can) {
            nextBtn.disabled = false;
            nextBtn.classList.add('active');
        } else {
            nextBtn.disabled = true;
            nextBtn.classList.remove('active');
        }
        return can;
    }

    function handleOptionClick(e) {
        const option = e.currentTarget;
        const parent = option.closest('.quiz-question');
        if (!parent) return;

        const questionNum = parseInt(parent.dataset.question, 10);
        const value = option.dataset.value;

        parent.querySelectorAll('.quiz-option').forEach(opt => opt.classList.remove('selected'));
        option.classList.add('selected');

        if (questionNum === 1) {
            if (value === 'Другой') {
                answers.city = 'Другой';
                answers.cityCustom = null;
                answers.cityNormalized = null;
                showCityInput();
                nextBtn.disabled = true;
                nextBtn.classList.remove('active');
            } else {
                answers.city = value;
                answers.cityCustom = null;
                answers.cityNormalized = {
                    original: value,
                    formatted: value,
                    normalized: value,
                    found: true
                };
                removeCityInput();
                checkCanProceed();
            }
        } else if (questionNum === 2) {
            answers.age = value;
            checkCanProceed();

            if (value === 'до 18') {
                nextBtn.disabled = true;
                nextBtn.classList.remove('active');
                if (ageError) ageError.style.display = 'block';
            } else {
                if (ageError) ageError.style.display = 'none';
            }
        } else if (questionNum === 3) {
            answers.delivery = value;
            checkCanProceed();
        }
    }

    document.querySelectorAll('.quiz-option').forEach(opt => {
        opt.addEventListener('click', handleOptionClick);
    });

    nextBtn.addEventListener('click', function(e) {
        e.preventDefault();
        if (this.disabled) return;

        if (currentQuestion === 3) {
            showResult();
            return;
        }

        if (currentQuestion < 3) {
            if (currentQuestion === 2) {
                const age = answers.age;
                if (!age || age === 'до 18') {
                    if (ageError) ageError.style.display = 'block';
                    this.disabled = true;
                    this.classList.remove('active');
                    return;
                }
            }

            currentQuestion++;
            updateStep();
            checkCanProceed();
        }
    });

    function showResult() {
        questions.forEach(q => q.classList.remove('active'));

        if (resultBlock) {
            resultBlock.style.display = 'flex';
            setTimeout(() => resultBlock.classList.add('show'), 20);
        }

        if (queueNumber) {
            const queue = Math.floor(Math.random() * 3) + 1;
            queueNumber.textContent = queue;
        }

        let cityDisplay = '';
        if (answers.city === 'Другой' && answers.cityNormalized) {
            cityDisplay = answers.cityNormalized.normalized;
        } else if (answers.city && answers.city !== 'Другой') {
            cityDisplay = answers.city;
        }

        titleEl.textContent = '🎉 Вы почти курьер!';
        subEl.textContent = `Город: ${cityDisplay || 'Не указан'}`;

        // На финальном шаге — галочка
        stepEl.innerHTML = `<strong style="font-weight: 900; font-size: inherit;">✅</strong>`;

        nextBtn.style.display = 'none';

        const finalCta = document.getElementById('quizFinalCta');
        if (finalCta) {
            finalCta.href = REFERRAL_URL;
            finalCta.classList.add('js-referral-link');

            // ===== ОТСЛЕЖИВАНИЕ ДЛЯ ЯНДЕКС ДИРЕКТ =====
            // Удаляем старые обработчики, чтобы не было дублей
            const newCta = finalCta.cloneNode(true);
            finalCta.parentNode.replaceChild(newCta, finalCta);

            newCta.addEventListener('click', function(e) {
                if (typeof ym !== 'undefined') {
                    try {
                        // Основная цель для Яндекс Директ
                        ym(METRIKA_ID, 'reachGoal', 'quiz_submit');

                        // Дополнительные параметры для аналитики
                        ym(METRIKA_ID, 'reachGoal', 'quiz_complete', {
                            city: cityDisplay || answers.city || '',
                            age: answers.age || '',
                            delivery: answers.delivery || ''
                        });

                        console.log('[Metrika] ✅ Цель quiz_submit отправлена');
                    } catch(e) {
                        console.warn('[Metrika] ❌ Ошибка:', e);
                    }
                }
            });
        }

        // Отправляем событие завершения квиза (для статистики)
        if (typeof ym !== 'undefined') {
            try {
                ym(METRIKA_ID, 'reachGoal', 'quiz_complete', {
                    city: cityDisplay || answers.city || '',
                    age: answers.age || '',
                    delivery: answers.delivery || ''
                });
            } catch(e) {}
        }
    }

    function resetQuiz() {
        currentQuestion = 1;
        answers.city = null;
        answers.cityCustom = null;
        answers.cityNormalized = null;
        answers.age = null;
        answers.delivery = null;
        nextBtn.style.display = '';
        resultBlock.style.display = 'none';
        resultBlock.classList.remove('show');
        document.querySelectorAll('.quiz-option').forEach(opt => opt.classList.remove('selected'));
        removeCityInput();
        updateStep();
        checkCanProceed();
    }

    const observer = new MutationObserver(function() {
        if (quizModalOverlay.classList.contains('active')) {
            resetQuiz();
        }
    });
    observer.observe(quizModalOverlay, { attributes: true, attributeFilter: ['class'] });

    // Инициализация
    updateStep();
})();
