const socket = io('//' + document.location.hostname + ':' + document.location.port);
const paymentId = document.getElementsByTagName('paymentId')[0].innerText
const cancel = document.getElementById("cancel")
let cancelled = false

const image = document.getElementById("image");
const loadingParent = document.createElement("div");
loadingParent.style.position = "relative";
loadingParent.style.height = "0";
loadingParent.style.width = "0";
loadingParent.classList.add("loadingParent");
const loadingOverlay = document.createElement("div");
loadingOverlay.classList.add("loader");
loadingParent.appendChild(loadingOverlay);

image.appendChild(loadingParent);

const qrCode = document.getElementById("qrcode");
qrCode.addEventListener('load', function() {
    image.removeChild(loadingParent);
});

socket.on(('scanned'), function (data) {
    if (data !== paymentId && !cancelled) return;
    // show loading sign

    qrCode.style.opacity = 0.5;
    qrCode.style.filter = 'blur(10px)';

    // Append the loading overlay to the container element
    image.appendChild(loadingParent);
});
socket.on(('betaald'), function (data) {
    if (data !== paymentId) return;
    console.log("betaald")
    showConfirm("check-circle")
    // show confirmation and redirect to /
});

socket.on(('failed'), function (data) {
    if (data !== paymentId) return;
    console.log("failed")
    showConfirm("x-circle")
    // show fail and redirect to /
});

socket.on(('verificationFailed'), function (data) {
    if (data !== paymentId) return;
    alert('Gebrield me verificatie? (zeg aan Renaut dat ik het kan bekijken ☺)')
    // show fail and redirect to /
    showConfirm("check-circle")
});

socket.on(('heh'), function (data) {
    if (data !== paymentId) return;
    alert('Payment probably failed. Callback didnt return succeeded or cancelled. (zeg aan Renaut dat ik het kan fixen ☺)')

});

cancel.onclick = async function () {

    if(confirm("Ben je zeker dat je de betaling wilt annuleren?")){
        let formData = {paymentId: paymentId}

        let xhr = new XMLHttpRequest();
        xhr.open('POST', '/payment/cancel');
        xhr.setRequestHeader("Content-Type", "application/JSON");
        xhr.onload = function(){
            if(xhr.response==="k"){
                // show cancel and redirect to /
                console.log("Succesfully canceled")
                cancelled = true;
                window.location = "/"
            }

            else
                alert("Cancel failed. (already paid / expired)")
        }
        await xhr.send(JSON.stringify(formData));
    }
};

function showConfirm(symbol) {

    const confirmDiv = document.createElement('div');
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
        window.location = "/"
    });

    // Append the 'confirm' div
    document.body.appendChild(confirmDiv);
}