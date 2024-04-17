const socket = io('//' + document.location.hostname + ':' + document.location.port);

const amountButtonsArray = [...document.getElementsByTagName("button")];
const normalButtons = document.getElementsByClassName("normal-buttons");
const customButton = document.getElementsByClassName("custom-button");
const amount = document.getElementById("amount");
const qrImage = document.getElementById("qrImage");
const cancelButton = document.getElementById("cancel");
const loader = document.getElementsByClassName("loader")[0];

let paymentId;
let confirmDiv;

amountButtonsArray.forEach((item) => {
    item.onclick = async function () {
        let bedrag = -1;

        if(item.classList.contains("custom-button")){
            do{
                const input = window.prompt("Geef een bedrag (€) in. Minimum €1.", "")
                if(input===null) return // user cancelled the prompt
                bedrag = parseFloat(input.replace(',', '.')).toFixed(2);
            } while ( isNaN(bedrag) || bedrag <1 )
        } else {
            bedrag = parseFloat(item.id, 10).toFixed(2);
        }

        [...normalButtons].forEach((item) => {
            hide(item)
        });

        [...customButton].forEach((item) => {
            hide(item)
        });

        amount.textContent = "€"+bedrag
        amount.classList.remove("invisible")
        qrImage.classList.remove("invisible")
        cancelButton.classList.remove("invisible")
        loader.classList.remove("invisible")

        let xhr = new XMLHttpRequest();
        xhr.open('GET', '/payment?amount='+bedrag);
        xhr.setRequestHeader('content-type','none');
        xhr.onload = function(){

            const response = JSON.parse(xhr.response);
            // console.log(response)
            qrImage.src = response.qrCode;
            paymentId = response.paymentId;
            hide(loader)
        }
        xhr.send();

    };
});


cancelButton.onclick = async function () {

    if(confirm("Ben je zeker dat je de betaling wilt annuleren?")){
        let formData = {paymentId: paymentId}

        let xhr = new XMLHttpRequest();
        xhr.open('POST', '/payment/cancel');
        xhr.setRequestHeader("Content-Type", "application/JSON");
        xhr.onload = function(){
            if(xhr.response==="k"){
                // show cancel and redirect to /
                //console.log("Succesfully canceled")
                startNewPayment();
            }

            else
                alert("Cancel failed. (already paid / expired)")
        }
        await xhr.send(JSON.stringify(formData));
    }
};

function hide(element){
    if(!element.classList.contains("invisible"))
        element.classList.add("invisible");
}


socket.on(('scanned'), function (data) {
    if (data !== paymentId) return;
    // show loading sign

    qrImage.style.opacity = 0.5;
    qrImage.style.filter = 'blur(10px)';
    loader.classList.remove("invisible")
});
socket.on(('betaald'), function (data) {
    if (data !== paymentId) return;
    console.log("betaald")
    showConfirm("check-circle")
    // show confirmation and reset /
});

socket.on(('failed'), function (data) {
    if (data !== paymentId) return;
    console.log("failed")
    showConfirm("x-circle")
    // show fail and reset /
});

socket.on(('verificationFailed'), function (data) {
    if (data !== paymentId) return;
    alert('Gebrield me verificatie? (zeg aan Renaut dat ik het kan bekijken ☺)')
    // show fail and reset /
    showConfirm("x-circle")
});

socket.on(('heh'), function (data) {
    if (data !== paymentId) return;
    alert('Payment probably failed. Callback didnt return succeeded or cancelled. (zeg aan Renaut dat ik het kan fixen ☺)')

});


function showConfirm(symbol) {

    confirmDiv = document.createElement('div');
    confirmDiv.id = 'confirm';
    confirmDiv.setAttribute('transition-style', 'in:circle:hesitate');
    if(symbol==='check-circle')
        confirmDiv.style.backgroundColor = '#60b460';
    else
        confirmDiv.style.backgroundColor = '#ff7575';

    // Create the 'box-icon' element
    const boxIconElement = document.createElement('box-icon');
    boxIconElement.setAttribute("name", symbol)
    boxIconElement.setAttribute("color", "white")

    // Append the 'box-icon' to the 'confirm' div
    confirmDiv.appendChild(boxIconElement);

    confirmDiv.addEventListener('click', function() {
        startNewPayment();
    });

    // Append the 'confirm' div
    document.body.appendChild(confirmDiv);
}

function startNewPayment(){
    hide(amount);
    hide(qrImage);
    hide(cancelButton);
    hide(loader);
    qrImage.style.opacity = 1;
    qrImage.style.filter = 'none';
    qrImage.src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA";  // blank img

    [...normalButtons].forEach((item) => {
        item.classList.remove("invisible");
    });

    [...customButton].forEach((item) => {
        item.classList.remove("invisible");
    });

    paymentId = null;
    document.body.removeChild(confirmDiv);
    confirmDiv = null;
}
