import torch
import torch.nn as nn
import torch.optim as optim
import numpy as np
import os
from datetime import datetime

class TradingNetwork(nn.Module):
    def __init__(self, input_size=48, hidden_size=64, output_size=3):
        super().__init__()
        # Define the neural network layers
        self.fc1 = nn.Linear(input_size, hidden_size)
        self.fc2 = nn.Linear(hidden_size, output_size)
        
        # Initialize weights
        self._initialize_weights()

    def _initialize_weights(self):
        """Initialize weights using Kaiming uniform distribution."""
        for m in self.modules():
            if isinstance(m, nn.Linear):
                nn.init.kaiming_uniform_(m.weight, a=np.sqrt(5))
                if m.bias is not None:
                    fan_in, _ = nn.init._calculate_fan_in_and_fan_out(m.weight)
                    bound = 1 / np.sqrt(fan_in)
                    nn.init.uniform_(m.bias, -bound, bound)

    def forward(self, x):
        """Forward pass through the network."""
        x = torch.relu(self.fc1(x))
        x = torch.softmax(self.fc2(x), dim=1)  # Probability distribution over actions
        return x


class NeuralBrain(TradingNetwork):
    def __init__(self, input_size=48, hidden_size=64, output_size=3):
        super().__init__(input_size, hidden_size, output_size)
        # You can add custom initialization or methods here if needed

    def conclude(self, df, intel):
        """
        Make a trading decision based on market data (df) and proprietary intel (dict).
        Returns (decision, confidence).
        """
        # Example: Use last close price and dummy logic for demonstration
        close = df['close'].iloc[-1] if 'close' in df.columns else 0.0
        # Optionally use intel data if available
        # For now, just return HOLD with 0.5 confidence if no logic
        # Replace with your real decision logic
        action = "HOLD"
        confidence = 0.5
        if close > 0:
            action = "BUY" if close % 2 == 0 else "SELL"
            confidence = 0.8
        return action, confidence


class RLAgent:
    """
    Reinforcement Learning Agent that learns from trading outcomes.
    Implements Q-Learning with experience replay.
    """
    def __init__(self, model_path="brain.pth"):
        self.input_size = 48
        self.model = TradingNetwork(input_size=self.input_size)
        self.optimizer = optim.Adam(self.model.parameters(), lr=0.001)
        self.criterion = nn.MSELoss()  # Loss function
        
        # Experience Replay Memory
        self.memory = []  # (state, action, reward, next_state)
        self.max_memory_size = 1000
        
        # Training metrics
        self.total_trades = 0
        self.successful_trades = 0
        self.cumulative_reward = 0.0
        
        # Model persistence
        self.model_path = model_path
        
        # Load existing brain if available
        if os.path.exists(self.model_path):
            try:
                self.model.load_state_dict(torch.load(self.model_path))
                self.model.eval()  # Set to evaluation mode
                print(f"🧠 Loaded existing Neural Network from {self.model_path}")
                self._load_stats()
            except Exception as e:
                print(f"⚠️  Could not load existing model: {e}")
                print("🆕 Initializing fresh Neural Network")
        else:
            print("🆕 Initializing new Neural Network")

    def get_action(self, state_vector, epsilon=0.1):
        """
        Make a trading decision based on current market state.
        
        Args:
            state_vector: numpy array of 48 features
            epsilon: exploration rate (0.1 = 10% random exploration)
        
        Returns:
            action: "HOLD", "BUY", or "SELL"
            confidence: probability of the chosen action
            probabilities: full probability distribution
        """
        # Epsilon-greedy exploration
        # Occasionally make random decisions to explore new strategies
        if np.random.random() < epsilon:
            action_idx = np.random.randint(0, 3)
            confidence = 0.33  # Random guess
            print("🎲 Exploration mode: Random action")
        else:
            # Convert numpy array to PyTorch Tensor
            state = torch.from_numpy(state_vector).float().unsqueeze(0)
            
            # Neural Network inference (The "Thinking" part)
            with torch.no_grad():
                self.model.eval()
                probs = self.model(state)
            
            # Extract probabilities
            probs_np = probs.numpy()[0]
            action_idx = np.argmax(probs_np)
            confidence = probs_np[action_idx]
        
        # Map to action names
        actions = ["HOLD", "BUY", "SELL"]
        action = actions[action_idx]
        
        # Get full probability distribution for transparency
        state_tensor = torch.from_numpy(state_vector).float().unsqueeze(0)
        with torch.no_grad():
            self.model.eval()
            full_probs = self.model(state_tensor).numpy()[0]
        
        probabilities = {
            "HOLD": float(full_probs[0]),
            "BUY": float(full_probs[1]),
            "SELL": float(full_probs[2])
        }
        
        return action, float(confidence), probabilities

    def remember(self, state, action_idx, reward, next_state):
        """Store experience in memory for later training."""
        self.memory.append((state, action_idx, reward, next_state))
        
        # Keep memory size manageable
        if len(self.memory) > self.max_memory_size:
            self.memory.pop(0)

    def train(self, state, action_idx, reward, next_state):
        """
        Train the neural network based on trading outcome (Reinforcement Learning).
        
        This is simplified Q-Learning:
        Q(s,a) = reward + gamma * max(Q(s',a'))
        """
        # Store experience
        self.remember(state, action_idx, reward, next_state)
        
        # Update metrics
        self.total_trades += 1
        self.cumulative_reward += reward
        if reward > 0:
            self.successful_trades += 1
        
        # Switch to training mode
        self.model.train()
        
        # Prepare tensors
        state_tensor = torch.from_numpy(state).float().unsqueeze(0)
        next_state_tensor = torch.from_numpy(next_state).float().unsqueeze(0)
        
        # Forward pass: Get current Q-values
        current_q_values = self.model(state_tensor)
        
        # Calculate target Q-value
        with torch.no_grad():
            next_q_values = self.model(next_state_tensor)
            max_next_q = torch.max(next_q_values)
        
        # Q-Learning formula: Q(s,a) = reward + gamma * max(Q(s',a'))
        gamma = 0.95  # Discount factor
        target_q = reward + gamma * max_next_q
        
        # Create target tensor
        target = current_q_values.clone()
        target[0][action_idx] = target_q
        
        # Calculate loss
        loss = self.criterion(current_q_values, target)
        
        # Backward pass
        self.optimizer.zero_grad()
        loss.backward()
        self.optimizer.step()
        
        # Save the updated brain
        self.save()
        
        print(f"📈 Training metrics: Loss={loss.item():.4f}, Win Rate={self.get_win_rate():.1f}%")

    def save(self):
        """Persist the neural network to disk."""
        torch.save(self.model.state_dict(), self.model_path)
        self._save_stats()

    def _save_stats(self):
        """Save training statistics."""
        stats = {
            'total_trades': self.total_trades,
            'successful_trades': self.successful_trades,
            'cumulative_reward': self.cumulative_reward
        }
        stats_path = self.model_path.replace('.pth', '_stats.json')
        import json
        with open(stats_path, 'w') as f:
            json.dump(stats, f)

    def _load_stats(self):
        """Load training statistics."""
        stats_path = self.model_path.replace('.pth', '_stats.json')
        if os.path.exists(stats_path):
            import json
            with open(stats_path, 'r') as f:
                stats = json.load(f)
                self.total_trades = stats.get('total_trades', 0)
                self.successful_trades = stats.get('successful_trades', 0)
                self.cumulative_reward = stats.get('cumulative_reward', 0.0)
            print(f"📊 Loaded stats: {self.total_trades} trades, {self.get_win_rate():.1f}% win rate")

    def get_win_rate(self):
        """Calculate win rate percentage."""
        if self.total_trades == 0:
            return 0.0
        return (self.successful_trades / self.total_trades) * 100

    def get_stats(self):
        """Return current performance statistics."""
        return {
            'total_trades': self.total_trades,
            'successful_trades': self.successful_trades,
            'win_rate': self.get_win_rate(),
            'cumulative_reward': self.cumulative_reward,
            'memory_size': len(self.memory)
        }


# Test the brain
if __name__ == "__main__":
    print("🧪 Testing Neural Network Brain...")
    
    # Initialize agent
    agent = RLAgent()
    
    # Create mock market state (48 features)
    mock_state = np.random.rand(48).astype(np.float32)
    
    # Get prediction
    action, confidence, probs = agent.get_action(mock_state)
    
    print(f"\n🧠 PREDICTION:")
    print(f"   Action: {action}")
    print(f"   Confidence: {confidence*100:.2f}%")
    print(f"   Probabilities: {probs}")
    
    # Simulate a trade outcome
    mock_next_state = np.random.rand(48).astype(np.float32)
    reward = 1.0  # Successful trade
    
    print(f"\n🎓 TRAINING on outcome...")
    action_idx = ["HOLD", "BUY", "SELL"].index(action)
    agent.train(mock_state, action_idx, reward, mock_next_state)
    
    print(f"\n📊 STATISTICS:")
    stats = agent.get_stats()
    for key, value in stats.items():
        print(f"   {key}: {value}")
