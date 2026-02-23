const socket = io(`//${document.location.hostname}:${document.location.port}`);

const chooseAmountDiv = document.querySelector("#chooseAmountDiv");
const amountButtons = [...document.querySelectorAll("#chooseAmountDiv button")];

const paymentDiv = document.querySelector("#paymentDiv");
const amount = document.querySelector("#paymentDiv p");
const qrImage = document.querySelector("#paymentDiv .qrDiv img");
const qrDiv = document.querySelector("#paymentDiv .qrDiv");
const loaderContainer = document.querySelector("#paymentDiv .loader-container");
const errorIcon = document.querySelector("#errorIcon");
const cancelButton = document.querySelector("#paymentDiv button");
const loader = document.querySelector(".loader");

let paymentId;

qrImage.onload = () => setQRVisualState(false);

amountButtons.forEach((button) => {
    button.onclick = async () => {
        let bedrag = -1;

        if (!button.hasAttribute('amount')) {
            do {
                const input = window.prompt("Geef een bedrag (€) in. Minimum €1.", "");
                if (input === null) return; // User cancelled
                bedrag = parseFloat(input.replace(',', '.')).toFixed(2);
            } while (isNaN(bedrag) || bedrag < 1);
        } else {
            bedrag = parseFloat(button.getAttribute('amount')).toFixed(2);
        }

        updatePaymentUI(bedrag);

        const xhr = new XMLHttpRequest();
        xhr.open('GET', `/payment?amount=${bedrag}`);
        xhr.setRequestHeader('content-type', 'none');
        xhr.onload = () => {
            if (xhr.status === 200) {
                const response = JSON.parse(xhr.response);
                qrImage.src = response.qrCode;
                paymentId = response.paymentId;
            } else {
                setVisibility(qrDiv, true);
                setVisibility(loaderContainer, true);
                setVisibility(errorIcon, false);
                paymentId = null;
            }
        };
        xhr.send();
    };
});

// document.querySelector('#flameIcon').onclick = playVlam;

cancelButton.onclick = async () => {
    if (confirm("Ben je zeker dat je de betaling wilt annuleren?")) {
        const formData = { paymentId };
        paymentId = null;

        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/payment/cancel');
        xhr.setRequestHeader("Content-Type", "application/json");
        xhr.onload = () => {
            if (xhr.response !== "k") {
                alert("Cancel failed. (already canceled, paid or expired)");
            }

            startNewPayment();
        };
        xhr.send(JSON.stringify(formData));
    }
};

const handlePaymentEvent = (event, handler) => socket.on(event, (data) => data === paymentId && handler(data));

const showPaymentStatus = (status, message = '') => showConfirm(status, message);

handlePaymentEvent('scanned', () => setQRVisualState(true));
handlePaymentEvent('betaald', () => showPaymentStatus("check-circle"));
handlePaymentEvent('auth_fail', () => showPaymentStatus("x-circle", 'Autorisatie van betaling mislukt'));
handlePaymentEvent('canceled', () => showPaymentStatus("x-circle", 'Betaling geannuleerd door klant'));
handlePaymentEvent('expired', () => showPaymentStatus("x-circle", 'Betaling verlopen'));
handlePaymentEvent('failed', () => showPaymentStatus("x-circle", 'Betaling mislukt'));
handlePaymentEvent('verificationFailed', () => showPaymentStatus("x-circle", 'Verificatie van betaling mislukt'));
handlePaymentEvent('heh', () => alert('Unexpected status. Stuur Renaut dat ik het kan oplossen :). Betaling mislukt. Ververs de pagina.'));


function showConfirm(symbol, cancelReason) {
    confirmDiv = document.createElement('div');
    confirmDiv.id = 'confirm';
    // confirmDiv.setAttribute('transition-style', 'in:circle:hesitate');
    confirmDiv.style.backgroundColor = symbol === 'check-circle' ? '#60b460' : '#ff7575';

    confirmDiv.innerHTML += `<a style="position: absolute; color: white; left: ${amount.getBoundingClientRect().x}px; top: ${amount.getBoundingClientRect().y}px;">${amount.textContent}</a>`;

    confirmDiv.innerHTML += `<box-icon name="${symbol}" color="white"></box-icon>`

    if(symbol === 'x-circle')
        confirmDiv.innerHTML += `<a style="position: absolute; color: white; font-size: 65px; text-align: center; width: calc(100vw - 70px); padding: 0 35px; bottom: ${amount.getBoundingClientRect().y*0.5}px;">${cancelReason}</a></div>`
    else {
        // playVlam();
        confirmDiv.innerHTML += `<img style="position: absolute; width: 75%; height: auto; left: 50%; transform: translateX(-50%); bottom: ${amount.getBoundingClientRect().y*0.5}px;" src="/images/bacardi_logo_tekst.png"></div>`
    }


    confirmDiv.addEventListener('click', startNewPayment);
    document.body.appendChild(confirmDiv);
}

function playVlam() {
    const audio = new Audio('/sounds/VLAM.mp3');
    audio.play();
}

function startNewPayment() {
    setVisibility(paymentDiv, true);
    setVisibility(chooseAmountDiv, false);
    resetQRImage();
    document.querySelector("#confirm")?.remove();
    paymentId = null;
}

function setVisibility(elements, hide) {
    const elementsArray = Array.isArray(elements) ? elements : [elements];
    elementsArray.forEach(el => el.classList[hide ? 'add' : 'remove']("d-none"));
}

function updatePaymentUI(bedrag) {
    amount.textContent = `€${bedrag}`;
    setVisibility(chooseAmountDiv, true);
    setVisibility(paymentDiv, false);
    setQRVisualState(true);
}

function setQRVisualState(blurred) {
    qrDiv.style.opacity = blurred ? 0.5 : 1;
    qrDiv.style.filter = blurred ? 'blur(10px)' : 'none';
    setVisibility(loaderContainer, !blurred);
}

function resetQRImage() {
    qrDiv.style.opacity = 1;
    qrDiv.style.filter = 'none';
    setVisibility(qrDiv, false);
    setVisibility(errorIcon, true);
    qrImage.src = "/images/qrcode.svg";
}
