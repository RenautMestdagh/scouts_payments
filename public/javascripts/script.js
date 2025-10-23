const socket = io(`//${document.location.hostname}:${document.location.port}`);

const chooseAmountDiv = document.querySelector("#chooseAmountDiv");
const amountButtons = [...document.querySelectorAll("#chooseAmountDiv button")];


const paymentDiv = document.querySelector("#paymentDiv");
const amount = document.querySelector("#paymentDiv a");
const qrImage = document.querySelector("#paymentDiv img");
const cancelButton = document.querySelector("#paymentDiv button");
const loader = document.querySelector(".loader");

let paymentId;

qrImage.onload = () => setVisibility(loader, true);

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
            const response = JSON.parse(xhr.response);
            qrImage.src = response.qrCode;
            paymentId = response.paymentId;
        };
        xhr.send();
    };
});

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

handlePaymentEvent('scanned', () => updateQRStatus(true));
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
    confirmDiv.setAttribute('transition-style', 'in:circle:hesitate');
    confirmDiv.style.backgroundColor = symbol === 'check-circle' ? '#60b460' : '#ff7575';

    confirmDiv.innerHTML += `<a style="position: absolute; color: white; left: ${amount.getBoundingClientRect().x}px; top: ${amount.getBoundingClientRect().y}px;">${amount.textContent}</a>`;

    confirmDiv.innerHTML += `<box-icon name="${symbol}" color="white"></box-icon>`

    if(symbol === 'x-circle')
        confirmDiv.innerHTML += `<a style="position: absolute; color: white; font-size: 65px; text-align: center; width: calc(100vw - 70px); padding: 0 35px; bottom: ${amount.getBoundingClientRect().y*0.5}px;">${cancelReason}</a></div>`

    confirmDiv.addEventListener('click', startNewPayment);
    document.body.appendChild(confirmDiv);
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
    setVisibility(loader, false);
}

function updateQRStatus(blurred) {
    qrImage.style.opacity = blurred ? 0.5 : 1;
    qrImage.style.filter = blurred ? 'blur(10px)' : 'none';
    setVisibility(loader, false);
}

function resetQRImage() {
    qrImage.style.opacity = 1;
    qrImage.style.filter = 'none';
    qrImage.src = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA";
}
