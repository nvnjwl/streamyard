# Copilot Instructions for StreamYard

## Project Overview
StreamYard is a streaming/broadcasting platform project in early development. This repository currently contains minimal code but is set up for future expansion.

## Current State & Architecture
- **Language/Framework**: Not yet determined (JavaScript/test.js suggests possible Node.js direction)
- **Repository**: https://github.com/nvnjwl/streamyard
- **Stage**: Early development with basic repository structure

## Development Guidelines

### Code Structure (When Implemented)
- Follow modular architecture patterns suitable for streaming applications
- Consider real-time communication requirements (WebRTC, WebSockets)
- Design for scalability - streaming platforms handle high concurrent loads

### Key Technical Considerations
- **Real-time Performance**: Optimize for low latency in streaming contexts
- **Media Handling**: Plan for audio/video processing pipelines
- **User Management**: Streaming platforms need robust authentication and session management
- **CDN Integration**: Consider content delivery network patterns for global reach

### Development Workflow
- Use `git log --oneline` to track development progress
- Commit messages should be descriptive for tracking feature development
- Current branch: `main` (standard GitHub default)

### Future Architecture Patterns to Consider
- **Microservices**: Separate concerns (streaming engine, user management, chat, etc.)
- **Event-driven**: Streaming applications benefit from event-based architectures  
- **API Gateway**: Centralized entry point for client applications
- **Database**: Consider both relational (users/metadata) and NoSQL (real-time data) needs

## File Organization (Recommended)
```
src/
├── streaming/       # Core streaming functionality
├── auth/           # User authentication & authorization
├── api/            # REST/GraphQL API routes
├── websockets/     # Real-time communication
├── media/          # Audio/video processing
└── config/         # Environment and service configuration

tests/              # Test suites organized by component
docs/               # API documentation and architecture diagrams
scripts/            # Build, deployment, and utility scripts
```

## Dependencies to Consider
- **Streaming**: WebRTC, FFmpeg, OBS integration libraries
- **Real-time**: Socket.io, WebSocket libraries
- **Media Processing**: Audio/video codecs and processing tools
- **Infrastructure**: Docker, Kubernetes for containerization
- **Monitoring**: Logging and metrics for streaming performance

## When Adding Features
- Consider impact on streaming performance and latency
- Plan for horizontal scaling from the start
- Design APIs with rate limiting for high-traffic scenarios
- Implement proper error handling for network interruptions
- Consider mobile/web client compatibility

---
*This file should be updated as the codebase grows and patterns emerge.*