# Optionaut 4D

This project is a work in progress, check back later as it is developed.

A stunning 3D visualization of options trading using Three.js, featuring realistic orbital mechanics where rockets represent options contracts orbiting around the underlying price.

## 🚀 Features

- **Realistic Orbital Mechanics**: Rockets orbit the planet using physics-based gravity (inverse square law)
- **Multi-Leg Strategies**: Launch multiple rockets to visualize complex options strategies (spreads, straddles, iron condors)
- **Greek-to-Physics Mapping**:
  - **Delta** → Thrust magnitude
  - **Theta** → Fuel burn rate (time decay)
  - **Vega** → Atmospheric drag (IV turbulence)
  - **Gamma** → Trajectory curvature
- **Interactive Controls**: Adjust strike price, spot price, IV, and DTE in real-time
- **Camera Follow Mode**: Automatically tracks rockets or free-fly navigation (WASD + Mouse)

## 🎮 Live Demo

Visit the live demo: [Option Rockets on Netlify](https://your-app-name.netlify.app/rockets.html)

## 🛠️ Local Development

### Prerequisites
- Node.js 16+ and npm

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/AGIworld.git
cd AGIworld

# Install dependencies
npm install

# Start development server
npm run dev
```

The app will be available at `http://localhost:3000/rockets.html`

### Controls

- **WASD / Arrow Keys**: Move camera (when follow mode disabled)
- **Mouse Drag**: Look around
- **Q / E**: Move camera up/down
- **Launch Rocket Button**: Add a new rocket to the scene
- **Follow Rocket Checkbox**: Toggle automatic camera tracking

## 📦 Deployment

### Deploy to Netlify

1. Push your code to GitHub
2. Connect your repository to Netlify
3. Netlify will auto-detect the build settings from `netlify.toml`
4. Deploy!

See [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) for detailed instructions.

## 🏗️ Project Structure

```
AGIworld/
├── backend/
│   └── rockets.html          # Main HTML entry point
├── src/
│   └── rockets/
│       ├── rockets-entry.js  # Main Three.js scene & physics
│       └── rocketState.js    # State management
├── netlify.toml              # Netlify configuration
├── package.json              # Dependencies
└── vite.config.js            # Vite build configuration
```

## 🎯 How It Works

### Physics Engine

The visualization implements realistic orbital mechanics:

1. **Gravitational Attraction**: `F = GM/r²` pulls rockets toward the planet
2. **Orbital Velocity**: Rockets start with tangential velocity for stable orbits
3. **Fuel-Based Thrust**: Thrust decreases as fuel burns (Theta decay)
4. **Atmospheric Drag**: Dampens velocity based on Vega (IV)

### Options Greeks Mapping

Each rocket's behavior is driven by Black-Scholes Greeks:

- **Strike Price** → Distance from planet
- **Delta** → Maximum thrust power
- **Theta** → Fuel burn rate (time decay)
- **Gamma** → Orbital eccentricity
- **Vega** → Atmospheric turbulence

## 🔧 Tech Stack

- **Three.js** - 3D graphics engine
- **Vite** - Build tool and dev server
- **Vanilla JavaScript** - No framework overhead
- **Black-Scholes Model** - Options pricing mathematics

## 📝 License

MIT License - feel free to use this for educational or commercial purposes

## 🤝 Contributing

Contributions welcome! Please open an issue or PR.

## 🎓 Educational Use

This visualization is perfect for:
- Teaching options trading concepts
- Understanding time decay (Theta)
- Visualizing multi-leg strategies
- Demonstrating the relationship between Greeks and price movement

## 🙏 Acknowledgments

Inspired by a conversation about making options trading as engaging as Kerbal Space Program!

---

Built with ❤️ for options traders and space enthusiasts
