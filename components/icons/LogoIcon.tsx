
const LogoIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="48" height="48">
        <defs>
            <linearGradient id="goldGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style={{stopColor: '#D4AF37', stopOpacity: 1}} />
            <stop offset="100%" style={{stopColor: '#B8860B', stopOpacity: 1}} />
            </linearGradient>
        </defs>
        <path fill="url(#goldGradient)" d="M100,10 C149.7,10 190,50.3 190,100 C190,149.7 149.7,190 100,190 C50.3,190 10,149.7 10,100 C10,50.3 50.3,10 100,10 Z M100,20 C55.8,20 20,55.8 20,100 C20,144.2 55.8,180 100,180 C144.2,180 180,144.2 180,100 C180,55.8 144.2,20 100,20 Z" />
        <path fill="url(#goldGradient)" d="M60,60 L140,100 L60,140 Z" />
    </svg>
);

export default LogoIcon;
