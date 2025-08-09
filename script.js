// CONFIGURAZIONE INTERVALLI (modificabili)
const INTERVALLI = {
    ROSSO: 90,    // secondi
    VERDE: 27,    // secondi  
    GIALLO: 3     // secondi
};

// ORARIO DI RIFERIMENTO: 8/08/2025 17:48:44 (inizio dei 3 secondi di giallo)
const RIFERIMENTO_BASE = new Date('2025-08-08T17:48:44.000Z');

// CONFIGURAZIONE SEMAFORI
const SEMAFORI = {
    MODIGLIANA: {
        id: 'modigliana',
        nome: 'Verso Modigliana',
        coordinate: {
            lat: 44.17282857064656,
            lng: 11.812279848983788
        },
        riferimento: RIFERIMENTO_BASE, // Stesso riferimento
        icon: '🟦',
        color: '#3b82f6'
    },
    FAENZA: {
        id: 'faenza', 
        nome: 'Verso Faenza',
        coordinate: {
            lat: 44.171031713746146,
            lng: 11.809469937437775
        },
        riferimento: new Date(RIFERIMENTO_BASE.getTime() + 60000), // +60 secondi
        icon: '🟩',
        color: '#10b981'
    }
};

// Semaforo attualmente selezionato
let semaforoAttivo = SEMAFORI.MODIGLIANA;

// Stati del semaforo
const STATI = {
    ROSSO: 'rosso',
    VERDE: 'verde', 
    GIALLO: 'giallo'
};

let map;
let routingControl;
let posizioneUtente = null;
let markerUtente = null;
let markerSemafori = {}; // Conterrà i marker di entrambi i semafori
let percorsoAttivo = false; // Traccia se c'è un percorso attivo

class Semaforo {
    constructor() {
        this.luci = {
            rosso: document.getElementById('rosso'),
            giallo: document.getElementById('giallo'),
            verde: document.getElementById('verde')
        };
        
        this.numeri = {
            rosso: document.getElementById('numero-rosso'),
            giallo: document.getElementById('numero-giallo'),
            verde: document.getElementById('numero-verde')
        };
        
        this.info = {
            stato: document.getElementById('stato-attuale'),
            tempo: document.getElementById('tempo-rimanente')
        };
        
        this.percorso = {
            tempo: document.getElementById('tempo-percorso'),
            stato: document.getElementById('stato-arrivo'),
            distanza: document.getElementById('distanza')
        };
        
        this.avvia();
        this.inizializzaPosizione();
    }
    
    cambiaSemaforo(nuovoSemaforo) {
        console.log(`🔄 Cambio semaforo a: ${nuovoSemaforo.nome}`);
        semaforoAttivo = nuovoSemaforo;
        
        // Aggiorna titolo
        document.querySelector('.header h1').innerHTML = `${nuovoSemaforo.icon} Semaforo ${nuovoSemaforo.nome}`;
        
        // Aggiorna immediatamente il display del semaforo
        this.aggiornaDisplay();
        
        // NON ricalcolare automaticamente il percorso qui per evitare ricaricamenti
        // Il percorso verrà ricalcolato solo quando necessario
    }
    
    inizializzaPosizione() {
        console.log('🔍 Richiesto permesso geolocalizzazione...');
        
        if (navigator.geolocation) {
            // Chiedi la posizione con opzioni più aggressive
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    console.log('✅ Posizione ottenuta:', position.coords);
                    posizioneUtente = {
                        lat: position.coords.latitude,
                        lng: position.coords.longitude
                    };
                    
                    // Aggiorna UI
                    this.percorso.tempo.textContent = 'Calcolando percorso...';
                    this.percorso.stato.textContent = 'Calcolando...';
                    
                    // Aggiungi marker utente alla mappa
                    this.aggiungiMarkerUtente();
                    
                    // Calcola il percorso
                    setTimeout(() => {
                        this.calcolaPercorso();
                    }, 1000);
                },
                (error) => {
                    console.error('❌ Errore geolocalizzazione:', error);
                    
                    let messaggioErrore = '';
                    switch(error.code) {
                        case error.PERMISSION_DENIED:
                            messaggioErrore = 'Permesso negato - Clicca "Aggiorna Posizione"';
                            break;
                        case error.POSITION_UNAVAILABLE:
                            messaggioErrore = 'Posizione non disponibile';
                            break;
                        case error.TIMEOUT:
                            messaggioErrore = 'Timeout - Clicca "Aggiorna Posizione"';
                            break;
                        default:
                            messaggioErrore = 'Errore sconosciuto - Clicca "Aggiorna Posizione"';
                    }
                    
                    this.percorso.tempo.textContent = messaggioErrore;
                    this.percorso.stato.textContent = 'N/A';
                },
                {
                    enableHighAccuracy: true,
                    timeout: 10000,
                    maximumAge: 60000
                }
            );
        } else {
            console.error('❌ Geolocalizzazione non supportata');
            this.percorso.tempo.textContent = 'Geolocalizzazione non supportata';
            this.percorso.stato.textContent = 'N/A';
        }
    }
    
    aggiungiMarkerUtente() {
        if (!posizioneUtente || !map) return;
        
        // Rimuovi marker precedente
        if (markerUtente) {
            map.removeLayer(markerUtente);
        }
        
        // Crea nuovo marker per l'utente
        const utenteIcon = L.divIcon({
            html: `
                <div style="
                    background: #10b981;
                    width: 35px;
                    height: 35px;
                    border-radius: 50%;
                    border: 3px solid #fff;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 16px;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
                    animation: pulse 2s infinite;
                ">📍</div>
                <style>
                    @keyframes pulse {
                        0% { transform: scale(1); }
                        50% { transform: scale(1.1); }
                        100% { transform: scale(1); }
                    }
                </style>
            `,
            className: 'utente-marker',
            iconSize: [35, 35],
            iconAnchor: [17, 17]
        });
        
        markerUtente = L.marker([posizioneUtente.lat, posizioneUtente.lng], {
            icon: utenteIcon
        }).addTo(map)
        
        console.log('✅ Marker utente aggiunto alla mappa');
    }
    
    calcolaPercorso() {
        if (!posizioneUtente || !map) {
            console.log('❌ Impossibile calcolare percorso - posizione utente o mappa mancanti');
            return;
        }
        
        const destinazione = semaforoAttivo.coordinate;
        console.log('🗺️ Calcolando percorso da:', posizioneUtente, 'a:', destinazione);
        
        // Rimuovi il routing precedente se esiste
        if (routingControl) {
            map.removeControl(routingControl);
            percorsoAttivo = false; // Reset percorso attivo
            console.log('🗑️ Routing precedente rimosso');
        }
        
        // Aggiorna UI
        this.percorso.tempo.textContent = 'Calcolando...';
        this.percorso.distanza.textContent = 'Calcolando...';
        this.percorso.stato.textContent = 'Calcolando...';
        
        // Crea il nuovo routing
        routingControl = L.Routing.control({
            waypoints: [
                L.latLng(posizioneUtente.lat, posizioneUtente.lng),
                L.latLng(destinazione.lat, destinazione.lng)
            ],
            routeWhileDragging: false,
            addWaypoints: false,
            createMarker: function() { return null; }, // Non creare marker automatici
            lineOptions: {
                styles: [{ color: semaforoAttivo.color, weight: 5, opacity: 0.8 }]
            },
            show: false, // Nasconde il pannello di istruzioni
            collapsible: false
        }).on('routesfound', (e) => {
            console.log('✅ Percorso trovato!', e);
            const routes = e.routes;
            const route = routes[0];
            
            if (route) {
                // Imposta che c'è un percorso attivo
                percorsoAttivo = true;
                
                // Aggiorna informazioni percorso
                const tempoSecondi = route.summary.totalTime;
                const distanzaMetri = route.summary.totalDistance;
                
                console.log(`⏱️ Tempo: ${tempoSecondi}s, Distanza: ${distanzaMetri}m`);
                
                this.percorso.tempo.textContent = this.formatTempo(tempoSecondi);
                this.percorso.distanza.textContent = this.formatDistanza(distanzaMetri);
                
                // Calcola stato semaforo all'arrivo (che include anche l'aggiornamento del marker)
                this.calcolaStatoSemaforoAllArrivo(tempoSecondi);
                
                // Centra la mappa sul percorso con padding
                const group = new L.featureGroup([
                    L.marker([posizioneUtente.lat, posizioneUtente.lng]),
                    L.marker([destinazione.lat, destinazione.lng])
                ]);
                map.fitBounds(group.getBounds().pad(0.1));
            }
        }).on('routingerror', (e) => {
            console.error('❌ Errore nel routing:', e);
            this.percorso.tempo.textContent = 'Errore nel calcolo percorso';
            this.percorso.stato.textContent = 'N/A';
        }).addTo(map);
        
        console.log('🛣️ Controllo routing aggiunto alla mappa');
    }
    
    formatTempo(secondi) {
        const minuti = Math.floor(secondi / 60);
        const ore = Math.floor(minuti / 60);
        
        if (ore > 0) {
            return `${ore}h ${minuti % 60}min`;
        } else {
            return `${minuti}min`;
        }
    }
    
    formatDistanza(metri) {
        if (metri >= 1000) {
            return `${(metri / 1000).toFixed(1)} km`;
        } else {
            return `${Math.round(metri)} m`;
        }
    }
    
    calcolaStatoSemaforoAllArrivo(tempoPercorsoSecondi) {
        const oraArrivo = new Date();
        oraArrivo.setSeconds(oraArrivo.getSeconds() + tempoPercorsoSecondi);
        
        // Usa il riferimento del semaforo attivo
        const riferimento = semaforoAttivo.riferimento;
        
        // Calcola lo stato del semaforo al momento dell'arrivo
        const differenzaMs = oraArrivo.getTime() - riferimento.getTime();
        
        if (differenzaMs < 0) {
            this.aggiornaStatoArrivo('rosso', 'ROSSO');
            return;
        }
        
        const cicloCOMPLETO = INTERVALLI.GIALLO + INTERVALLI.ROSSO + INTERVALLI.VERDE;
        const cicloMs = cicloCOMPLETO * 1000;
        const posizioneNelCiclo = differenzaMs % cicloMs;
        const posizioneSecondi = Math.floor(posizioneNelCiclo / 1000);
        
        let statoArrivo;
        if (posizioneSecondi < INTERVALLI.GIALLO) {
            statoArrivo = 'giallo';
        } else if (posizioneSecondi < INTERVALLI.GIALLO + INTERVALLI.ROSSO) {
            statoArrivo = 'rosso';
        } else {
            statoArrivo = 'verde';
        }
        
        this.aggiornaStatoArrivo(statoArrivo, statoArrivo.toUpperCase());
        
        // Aggiorna il marker sulla mappa con il colore del semaforo all'arrivo
        if (window.semaforoInstance) {
            window.semaforoInstance.aggiornaMarkerConStatoArrivo(statoArrivo);
        }
    }
    
    aggiornaStatoArrivo(classe, testo) {
        this.percorso.stato.textContent = testo;
        // Rimuovi tutte le classi di colore precedenti
        this.percorso.stato.classList.remove('rosso', 'giallo', 'verde');
        // Aggiungi la nuova classe di colore
        this.percorso.stato.classList.add(classe);
    }
    
    calcolaStatoAttuale() {
        const ora = new Date();
        
        // Usa il riferimento del semaforo attivo
        const riferimento = semaforoAttivo.riferimento;
        
        // Calcola i millisecondi trascorsi dal riferimento
        const differenzaMs = ora.getTime() - riferimento.getTime();
        
        // Se siamo prima del riferimento, mostra rosso
        if (differenzaMs < 0) {
            return {
                stato: STATI.ROSSO,
                tempoRimanente: Math.floor(Math.abs(differenzaMs) / 1000)
            };
        }
        
        // Calcola la durata totale di un ciclo completo
        const cicloCOMPLETO = INTERVALLI.GIALLO + INTERVALLI.ROSSO + INTERVALLI.VERDE;
        const cicloMs = cicloCOMPLETO * 1000;
        
        // Trova la posizione nel ciclo attuale
        const posizioneNelCiclo = differenzaMs % cicloMs;
        const posizioneSecondi = Math.floor(posizioneNelCiclo / 1000);
        
        // Il riferimento inizia con GIALLO
        if (posizioneSecondi < INTERVALLI.GIALLO) {
            // Siamo nel periodo GIALLO iniziale
            return {
                stato: STATI.GIALLO,
                tempoRimanente: INTERVALLI.GIALLO - posizioneSecondi
            };
        } else if (posizioneSecondi < INTERVALLI.GIALLO + INTERVALLI.ROSSO) {
            // Siamo nel periodo ROSSO
            return {
                stato: STATI.ROSSO,
                tempoRimanente: (INTERVALLI.GIALLO + INTERVALLI.ROSSO) - posizioneSecondi
            };
        } else {
            // Siamo nel periodo VERDE
            return {
                stato: STATI.VERDE,
                tempoRimanente: cicloCOMPLETO - posizioneSecondi
            };
        }
    }
    
    aggiornaDisplay() {
        const ora = new Date();
        const statoAttuale = this.calcolaStatoAttuale();
        
        // Aggiorna stato
        this.info.stato.textContent = statoAttuale.stato.toUpperCase();
        this.info.tempo.textContent = `${statoAttuale.tempoRimanente}s`;
        
        // Aggiorna luci e numeri
        this.spegniTutteLeLuci();
        this.accendiLuce(statoAttuale.stato, statoAttuale.tempoRimanente);
        
        // Aggiorna i marker sulla mappa solo se non c'è un percorso attivo
        // (quando c'è un percorso attivo, i marker mostrano lo stato di arrivo)
        if (!percorsoAttivo) {
            this.aggiornaLuciMarkerMappa(statoAttuale.stato);
        }
    }
    
    aggiornaMarkerConStatoArrivo(statoArrivo) {
        // Aggiorna il marker del semaforo attivo con il colore di quando arriverà l'utente
        if (!markerSemafori[semaforoAttivo.id]) return;
        
        const semaforo = semaforoAttivo;
        
        // Definisci i colori delle luci in base allo stato di arrivo
        let colorRosso = '#4a0000';
        let colorGiallo = '#4a4a00'; 
        let colorVerde = '#004a00';
        
        if (statoArrivo === 'rosso') {
            colorRosso = 'radial-gradient(circle, #ef4444, #dc2626)';
        } else if (statoArrivo === 'giallo') {
            colorGiallo = 'radial-gradient(circle, #fbbf24, #f59e0b)';
        } else if (statoArrivo === 'verde') {
            colorVerde = 'radial-gradient(circle, #10b981, #059669)';
        }
        
        const semaforoIcon = L.divIcon({
            html: `
                <div style="
                    background: linear-gradient(145deg, #2d3748, #1a202c);
                    width: 60px;
                    height: 120px;
                    border-radius: 15px;
                    border: 3px solid ${semaforo.color};
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: space-around;
                    padding: 8px 0;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.4);
                    position: relative;
                    animation: pulse-semaforo 2s infinite;
                    z-index: 1000;
                ">
                    <div style="
                        width: 18px;
                        height: 18px;
                        border-radius: 50%;
                        background: ${colorRosso};
                        box-shadow: inset 0 0 8px rgba(0,0,0,0.5);
                        ${statoArrivo === 'rosso' ? 'box-shadow: 0 0 15px #ef4444;' : ''}
                    "></div>
                    <div style="
                        width: 18px;
                        height: 18px;
                        border-radius: 50%;
                        background: ${colorGiallo};
                        box-shadow: inset 0 0 8px rgba(0,0,0,0.5);
                        ${statoArrivo === 'giallo' ? 'box-shadow: 0 0 15px #fbbf24;' : ''}
                    "></div>
                    <div style="
                        width: 18px;
                        height: 18px;
                        border-radius: 50%;
                        background: ${colorVerde};
                        box-shadow: inset 0 0 8px rgba(0,0,0,0.5);
                        ${statoArrivo === 'verde' ? 'box-shadow: 0 0 15px #10b981;' : ''}
                    "></div>
                    <div style="
                        position: absolute;
                        bottom: -15px;
                        left: 50%;
                        transform: translateX(-50%);
                        background: ${semaforo.color};
                        color: white;
                        padding: 2px 6px;
                        border-radius: 8px;
                        font-size: 10px;
                        font-weight: bold;
                        white-space: nowrap;
                        box-shadow: 0 2px 4px rgba(0,0,0,0.3);
                        z-index: 1001;
                    ">${semaforo.nome.replace('Verso ', '')}</div>
                </div>
            `,
            className: `semaforo-marker ${semaforo.id}`,
            iconSize: [60, 135],
            iconAnchor: [30, 135]
        });
        
        markerSemafori[semaforoAttivo.id].setIcon(semaforoIcon);
    }
    
    spegniTutteLeLuci() {
        Object.values(this.luci).forEach(luce => {
            luce.classList.remove('attivo');
        });
        
        // Nascondi tutti i numeri
        Object.values(this.numeri).forEach(numero => {
            numero.textContent = '';
        });
    }
    
    accendiLuce(stato, tempoRimanente) {
        if (this.luci[stato]) {
            this.luci[stato].classList.add('attivo');
            
            // Mostra il numero nella luce attiva
            if (this.numeri[stato]) {
                this.numeri[stato].textContent = tempoRimanente;
            }
        }
    }
    
    aggiornaLuciMarkerMappa(statoAttivo) {
        if (!markerSemafori[semaforoAttivo.id]) return;
        
        const isAttivo = true;
        const semaforo = semaforoAttivo;
        
        // Definisci i colori delle luci in base allo stato
        let colorRosso = '#4a0000';
        let colorGiallo = '#4a4a00'; 
        let colorVerde = '#004a00';
        
        if (statoAttivo === 'rosso') {
            colorRosso = 'radial-gradient(circle, #ef4444, #dc2626)';
        } else if (statoAttivo === 'giallo') {
            colorGiallo = 'radial-gradient(circle, #fbbf24, #f59e0b)';
        } else if (statoAttivo === 'verde') {
            colorVerde = 'radial-gradient(circle, #10b981, #059669)';
        }
        
        const semaforoIcon = L.divIcon({
            html: `
                <div style="
                    background: linear-gradient(145deg, #2d3748, #1a202c);
                    width: 60px;
                    height: 120px;
                    border-radius: 15px;
                    border: 3px solid ${semaforo.color};
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: space-around;
                    padding: 8px 0;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.4);
                    position: relative;
                    animation: pulse-semaforo 2s infinite;
                    z-index: 1000;
                ">
                    <div style="
                        width: 18px;
                        height: 18px;
                        border-radius: 50%;
                        background: ${colorRosso};
                        box-shadow: inset 0 0 8px rgba(0,0,0,0.5);
                        ${statoAttivo === 'rosso' ? 'box-shadow: 0 0 15px #ef4444;' : ''}
                    "></div>
                    <div style="
                        width: 18px;
                        height: 18px;
                        border-radius: 50%;
                        background: ${colorGiallo};
                        box-shadow: inset 0 0 8px rgba(0,0,0,0.5);
                        ${statoAttivo === 'giallo' ? 'box-shadow: 0 0 15px #fbbf24;' : ''}
                    "></div>
                    <div style="
                        width: 18px;
                        height: 18px;
                        border-radius: 50%;
                        background: ${colorVerde};
                        box-shadow: inset 0 0 8px rgba(0,0,0,0.5);
                        ${statoAttivo === 'verde' ? 'box-shadow: 0 0 15px #10b981;' : ''}
                    "></div>
                    <div style="
                        position: absolute;
                        bottom: -15px;
                        left: 50%;
                        transform: translateX(-50%);
                        background: ${semaforo.color};
                        color: white;
                        padding: 2px 6px;
                        border-radius: 8px;
                        font-size: 10px;
                        font-weight: bold;
                        white-space: nowrap;
                        box-shadow: 0 2px 4px rgba(0,0,0,0.3);
                        z-index: 1001;
                    ">${semaforo.nome.replace('Verso ', '')}</div>
                </div>
            `,
            className: `semaforo-marker ${semaforo.id}`,
            iconSize: [60, 135],
            iconAnchor: [30, 135]
        });
        
        markerSemafori[semaforoAttivo.id].setIcon(semaforoIcon);
    }
    
    avvia() {
        // Aggiorna immediatamente
        this.aggiornaDisplay();
        
        // Aggiorna ogni secondo
        setInterval(() => {
            this.aggiornaDisplay();
        }, 1000);
        
        // Ricalcola il percorso ogni 30 secondi
        setInterval(() => {
            if (posizioneUtente) {
                this.calcolaPercorso();
            }
        }, 30000);
        
        console.log('🚦 Semaforo Pappona avviato!');
        console.log(`📅 Riferimento Modigliana: ${SEMAFORI.MODIGLIANA.riferimento.toLocaleString('it-IT')}`);
        console.log(`📅 Riferimento Faenza: ${SEMAFORI.FAENZA.riferimento.toLocaleString('it-IT')}`);
        console.log(`⏱️ Intervalli: Rosso ${INTERVALLI.ROSSO}s, Verde ${INTERVALLI.VERDE}s, Giallo ${INTERVALLI.GIALLO}s`);
    }
}

// Inizializza la mappa Leaflet
function initMap() {
    // Calcola il centro tra i due semafori
    const centroLat = (SEMAFORI.MODIGLIANA.coordinate.lat + SEMAFORI.FAENZA.coordinate.lat) / 2;
    const centroLng = (SEMAFORI.MODIGLIANA.coordinate.lng + SEMAFORI.FAENZA.coordinate.lng) / 2;
    
    // Crea la mappa centrata tra i due semafori
    map = L.map('map').setView([centroLat, centroLng], 15);
    
    // Aggiungi tile layer di OpenStreetMap
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19
    }).addTo(map);
    
    // Crea marker solo per il semaforo attivo
    const semaforo = semaforoAttivo;
    
    const semaforoIcon = L.divIcon({
        html: `
            <div style="
                background: linear-gradient(145deg, #2d3748, #1a202c);
                width: 60px;
                height: 120px;
                border-radius: 15px;
                border: 3px solid ${semaforo.color};
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: space-around;
                padding: 8px 0;
                box-shadow: 0 4px 12px rgba(0,0,0,0.4);
                position: relative;
                animation: pulse-semaforo 2s infinite;
                z-index: 1000;
            ">
                <div style="
                    width: 18px;
                    height: 18px;
                    border-radius: 50%;
                    background: #4a0000;
                    box-shadow: inset 0 0 8px rgba(0,0,0,0.5);
                "></div>
                <div style="
                    width: 18px;
                    height: 18px;
                    border-radius: 50%;
                    background: #4a4a00;
                    box-shadow: inset 0 0 8px rgba(0,0,0,0.5);
                "></div>
                <div style="
                    width: 18px;
                    height: 18px;
                    border-radius: 50%;
                    background: #004a00;
                    box-shadow: inset 0 0 8px rgba(0,0,0,0.5);
                "></div>
                <div style="
                    position: absolute;
                    bottom: -15px;
                    left: 50%;
                    transform: translateX(-50%);
                    background: ${semaforo.color};
                    color: white;
                    padding: 2px 6px;
                    border-radius: 8px;
                    font-size: 10px;
                    font-weight: bold;
                    white-space: nowrap;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.3);
                    z-index: 1001;
                ">${semaforo.nome.replace('Verso ', '')}</div>
            </div>
            <style>
                @keyframes pulse-semaforo {
                    0% { transform: scale(1); }
                    50% { transform: scale(1.05); }
                    100% { transform: scale(1); }
                }
            </style>
        `,
        className: `semaforo-marker ${semaforo.id}`,
        iconSize: [60, 135],
        iconAnchor: [30, 135]
    });
    
    markerSemafori[semaforo.id] = L.marker([semaforo.coordinate.lat, semaforo.coordinate.lng], {
        icon: semaforoIcon,
        zIndexOffset: 1000
    }).addTo(map);
}

function aggiornaMarkerSemafori() {
    // Rimuovi tutti i marker esistenti
    Object.keys(markerSemafori).forEach(id => {
        if (markerSemafori[id]) {
            map.removeLayer(markerSemafori[id]);
            delete markerSemafori[id];
        }
    });
    
    // Crea solo il marker del semaforo attivo
    const semaforo = semaforoAttivo;
    
    const semaforoIcon = L.divIcon({
        html: `
            <div style="
                background: linear-gradient(145deg, #2d3748, #1a202c);
                width: 60px;
                height: 120px;
                border-radius: 15px;
                border: 3px solid ${semaforo.color};
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: space-around;
                padding: 8px 0;
                box-shadow: 0 4px 12px rgba(0,0,0,0.4);
                position: relative;
                animation: pulse-semaforo 2s infinite;
                z-index: 1000;
            ">
                <div style="
                    width: 18px;
                    height: 18px;
                    border-radius: 50%;
                    background: #4a0000;
                    box-shadow: inset 0 0 8px rgba(0,0,0,0.5);
                "></div>
                <div style="
                    width: 18px;
                    height: 18px;
                    border-radius: 50%;
                    background: #4a4a00;
                    box-shadow: inset 0 0 8px rgba(0,0,0,0.5);
                "></div>
                <div style="
                    width: 18px;
                    height: 18px;
                    border-radius: 50%;
                    background: #004a00;
                    box-shadow: inset 0 0 8px rgba(0,0,0,0.5);
                "></div>
                <div style="
                    position: absolute;
                    bottom: -15px;
                    left: 50%;
                    transform: translateX(-50%);
                    background: ${semaforo.color};
                    color: white;
                    padding: 2px 6px;
                    border-radius: 8px;
                    font-size: 10px;
                    font-weight: bold;
                    white-space: nowrap;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.3);
                    z-index: 1001;
                ">${semaforo.nome.replace('Verso ', '')}</div>
            </div>
        `,
        className: `semaforo-marker ${semaforo.id}`,
        iconSize: [60, 135],
        iconAnchor: [30, 135]
    });
    
    // Crea il nuovo marker
    markerSemafori[semaforo.id] = L.marker([semaforo.coordinate.lat, semaforo.coordinate.lng], {
        icon: semaforoIcon,
        zIndexOffset: 1000
    }).addTo(map);
}

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 Inizializzazione app...');
    
    // Inizializza la mappa
    initMap();
    
    // Inizializza il semaforo
    const semaforoInstance = new Semaforo();
    window.semaforoInstance = semaforoInstance;
    
    // Switch semafori
    document.querySelectorAll('.switch-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const semaforoId = e.target.dataset.semaforo;
            const nuovoSemaforo = semaforoId === 'modigliana' ? SEMAFORI.MODIGLIANA : SEMAFORI.FAENZA;
            
            // Aggiorna UI dei pulsanti
            document.querySelectorAll('.switch-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            
            // Cambia semaforo
            semaforoInstance.cambiaSemaforo(nuovoSemaforo);
            
            // Reset percorso attivo quando si cambia semaforo
            percorsoAttivo = false;
            
            // Aggiorna marker sulla mappa
            aggiornaMarkerSemafori();
            
            // Ricalcola percorso solo se abbiamo la posizione utente
            if (posizioneUtente) {
                console.log('🛣️ Ricalcolo percorso per nuovo semaforo');
                setTimeout(() => {
                    semaforoInstance.calcolaPercorso();
                }, 200);
            }
        });
    });
    
    // Bottone aggiorna posizione
    document.getElementById('aggiorna-posizione').addEventListener('click', () => {
        console.log('🔄 Bottone aggiorna posizione cliccato');
        
        if (navigator.geolocation) {
            // Mostra stato di caricamento
            document.getElementById('tempo-percorso').textContent = 'Aggiornando posizione...';
            
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    console.log('✅ Nuova posizione ottenuta:', position.coords);
                    
                    posizioneUtente = {
                        lat: position.coords.latitude,
                        lng: position.coords.longitude
                    };
                    
                    // Aggiungi/aggiorna marker utente
                    semaforoInstance.aggiungiMarkerUtente();
                    
                    // Ricalcola il percorso
                    semaforoInstance.calcolaPercorso();
                },
                (error) => {
                    console.error('❌ Errore aggiornamento posizione:', error);
                    
                    let messaggio = 'Errore: ';
                    switch(error.code) {
                        case error.PERMISSION_DENIED:
                            messaggio += 'Permesso negato. Abilita la geolocalizzazione nelle impostazioni del browser.';
                            break;
                        case error.POSITION_UNAVAILABLE:
                            messaggio += 'Posizione non disponibile.';
                            break;
                        case error.TIMEOUT:
                            messaggio += 'Richiesta scaduta. Riprova.';
                            break;
                        default:
                            messaggio += 'Errore sconosciuto.';
                    }
                    
                    alert(messaggio);
                    document.getElementById('tempo-percorso').textContent = 'Errore nell\'aggiornamento';
                },
                {
                    enableHighAccuracy: true,
                    timeout: 15000,
                    maximumAge: 0 // Forza una nuova richiesta
                }
            );
        } else {
            alert('Geolocalizzazione non supportata dal tuo browser.');
        }
    });
});

// Funzione per gestire il click sull'email
function copyEmail(event) {
    const email = 'filippo.maretti03@gmail.com';
    
    // Prova a copiare negli appunti
    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(email).then(() => {
            showEmailNotification('Email copiata negli appunti!');
        }).catch(() => {
            // Fallback se non funziona
            showEmailNotification(`Email: ${email}`);
        });
        event.preventDefault();
    } else {
        // Se clipboard non è disponibile, lascia che il mailto: funzioni
        showEmailNotification(`Apertura client email...`);
    }
}

// Mostra notifica email
function showEmailNotification(message) {
    // Rimuovi notifica esistente se presente
    const existingNotification = document.querySelector('.email-notification');
    if (existingNotification) {
        existingNotification.remove();
    }
    
    // Crea nuova notifica
    const notification = document.createElement('div');
    notification.className = 'email-notification';
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        background: rgba(52, 152, 219, 0.95);
        color: white;
        padding: 12px 20px;
        border-radius: 8px;
        font-size: 14px;
        font-weight: 500;
        z-index: 10000;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
        animation: slideInUp 0.3s ease-out;
    `;
    
    document.body.appendChild(notification);
    
    // Rimuovi dopo 3 secondi
    setTimeout(() => {
        notification.style.animation = 'slideOutDown 0.3s ease-in';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 300);
    }, 3000);
}

// Debug: funzione per testare il calcolo degli stati
window.debugSemaforo = function() {
    const ora = new Date();
    const semaforo = new Semaforo();
    const stato = semaforo.calcolaStatoAttuale();
    
    console.log('🔍 Debug Semaforo:');
    console.log(`Ora attuale: ${ora.toLocaleString('it-IT')}`);
    console.log(`Riferimento: ${RIFERIMENTO.toLocaleString('it-IT')}`);
    console.log(`Stato attuale: ${stato.stato}`);
    console.log(`Tempo rimanente: ${stato.tempoRimanente} secondi`);
    
    return stato;
};
