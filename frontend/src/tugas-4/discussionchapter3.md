# Chapter 3 Discussion: High-Level Architecture Thought Process

This discussion reflects our thought process while formulating the high-level system architecture for NullWasted, focusing on how we structured our services and managed the end-to-end data flow.

### 1. Deciding on the System Layers (The Helicopter View)
When designing the macro architecture, our main challenge was ensuring that heavy background tasks, like voice processing and safety checks, would never freeze the mobile interface.

In our team discussion, we decided to separate the system into four clear layers:
* The client layer runs directly in mobile browsers so staff and buyers can open the app instantly without app store downloads.
* The ingress layer uses an encrypted tunnel to protect the server without exposing open firewall ports to the public.
* The application layer runs our business logic and AI coordination in isolated containers on our host machine.
* The storage layer keeps data separated, using high-speed temporary memory for 15-minute checkout locks and relational storage for persistent store catalogs.

This modular separation ensures that if an external AI service slows down or fails, the core web application remains responsive.

### 2. Planning the End-to-End Pipeline
We wanted the process of turning spoken words into a live store listing to happen in just a few seconds. To achieve this, we designed a straight data pipeline:
* The browser records a short audio note and sends it directly through the encrypted connection.
* The backend transcribes the speech, extracts the food title and quantity, checks ingredients against safety rules, and calculates a fair discount based on store closing time.
* The result appears immediately as a preview on the staff member's phone. Once confirmed, the listing becomes live on the nearby customer feed.

### 3. Practical Architecture Decisions
Throughout our discussions, we agreed on two practical engineering rules:
* Keep hosting costs at zero: All containers run locally, and all external AI calls rely on resilient free tiers, making the project sustainable to maintain.
* Keep prices fixed once published: Discounts are calculated dynamically based on urgency, but once published, the price is locked to prevent buyers from playing waiting games at closing time.

### Summary
Focusing on clean layer separation and a predictable data pipeline gave us a stable architectural foundation that connects our initial ideas to a working implementation.
