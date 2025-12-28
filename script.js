const marker = new google.maps.Marker({
                        position: { lat: data.lat  0, lng: data.lng  0 },
                        map,
                        title: ID: ${data.infectionId}
                    });
                }
            });
        } catch (error) {
            handleError(error, 'loadWorldMap');
        }
    };
    document.head.appendChild(script);
}

// Get User Country (for Map)
async function getUserCountry() {
    try {
        const response = await fetch('https://ipapi.co/json/');
        const data = await response.json();
        return data.country_name;
    } catch {
        return 'Unknown';
    }
}

// Event Listeners (Instead of inline onclick for better separation)
document.addEventListener('DOMContentLoaded', () => {
    elements.enterButton.addEventListener('click', startGame);
    elements.copyButton.addEventListener('click', copyLink);
    elements.shareButton.addEventListener('click', shareLink);

    // Video Error Handling
    elements.introVideo.addEventListener('error', () => {
        elements.introPlaceholder.classList.remove('hidden');
        elements.introVideo.classList.add('hidden');
    });

    // Log app version
    console.log(`Virus Game v${APP_VERSION} loaded.`);
});

// Log Auto-start if referral param
if (new URLSearchParams(window.location.search).has('infected_by')) {
    startGame();
}

// Log app version
console.log(`Virus Game v${APP_VERSION} loaded.`);

// Global Exports for Module
window.startGame = startGame;
window.copyLink = copyLink;
window.shareLink = shareLink;

// Service Worker for PWA (Offline Support)
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').then(reg => console.log('SW registered', reg)).catch(err => console.error('SW registration failed', err));
}

// End of Code - Ready for Production Scaling
