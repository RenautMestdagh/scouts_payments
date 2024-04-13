const buttonsArray = [...document.getElementsByTagName("button")];
buttonsArray.forEach((item) => {
    item.onclick = function () {
        let bedrag = 10;

        if(item.id==="custom"){
            do{
                const input = window.prompt("Geef een bedrag (€) in", "")
                if(input===null) return // user cancelled the prompt
                bedrag = parseInt(input, 10);
            } while ( isNaN(bedrag) || bedrag <1 )
        }

        location.href="./payment?amount="+bedrag;

    };
});
