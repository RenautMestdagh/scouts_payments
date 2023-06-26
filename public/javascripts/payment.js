const socket = io('//' + document.location.hostname + ':' + document.location.port);
const paymentId = document.getElementsByTagName('paymentId')[0].innerText
const cancel = document.getElementById("cancel")
socket.on(('scanned'), function (data) {
    if (data !== paymentId) return;
    console.log("joepie")
    // show loading sign
});
socket.on(('betaald'), function (data) {
    if (data !== paymentId) return;
    console.log("betaald")
    // show confirmation and redirect to /
});

socket.on(('failed'), function (data) {
    if (data !== paymentId) return;
    console.log("failed")
    // show fail and redirect to /
});

socket.on(('verificationFailed'), function (data) {
    if (data !== paymentId) return;
    alert('Gebrield me verificatie? (zeg aan Renaut dat ik het kan bekijken ☺)')
    // show fail and redirect to /
});

socket.on(('heh'), function (data) {
    if (data !== paymentId) return;
    alert('Payment failed. Callback didnt return succeeded or cancelled. (zeg aan Renaut dat ik het kan fixen ☺)')

});

cancel.onclick = async function () {

    let formData = {paymentId: paymentId}

    let xhr = new XMLHttpRequest();
    xhr.open('POST', '/payment/cancel');
    xhr.setRequestHeader("Content-Type", "application/JSON");
    xhr.onload = function(){
        if(xhr.response==="k")
            // show cancel and redirect to /
            console.log("Succesfully canceled")
        else
            alert("Cancel failed. (already paid / expired)")
    }
    await xhr.send(JSON.stringify(formData));

};