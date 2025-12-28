function startGame() {
    document.getElementById('intro').style.display = 'none';
    document.getElementById('hub').style.display = 'block';
    initUser();
}

function initUser() {
    // Локальный ID (без базы)
    const urlParams = new URLSearchParams(window.location.search);
    const infectedBy = urlParams.get('infected_by') || 'Creator';
    let infectionId = localStorage.getItem('infectionId');
    if (!infectionId) {
        infectionId = Math.floor(Math.random() * 1000000);
        localStorage.setItem('infectionId', infectionId);
    }
    document.getElementById('infection-id').innerText = infectionId;
    document.getElementById('infected-by').innerText = infectedBy;

    const virusLink = ${window.location.origin}/?infected_by=${infectionId};
    document.getElementById('virus-link').value = virusLink;

    // Заглушка для топов и мини-игры
    console.log('ID generated: ' + infectionId);
}

function copyLink() {
    const link = document.getElementById('virus-link');
    link.select();
    document.execCommand('copy');
    alert('Link copied!');
}

function shareLink() {
    if (navigator.share) {
        navigator.share({
            title: 'Get Infected!',
            url: document.getElementById('virus-link').value
        });
    } else {
        copyLink();
    }
}

window.onload = () => {
    if (new URLSearchParams(window.location.search).has('infected_by')) {
        startGame();
    }
};
