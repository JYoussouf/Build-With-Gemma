# RaceMind

<img width="1774" height="887" alt="logo" src="https://github.com/user-attachments/assets/87bd5724-199b-405b-b834-6a20d976edbb" />


## Zero-latency racing intelligence - Deep simulation and race day insights

**Note to Reviewers After the Hackathon:** For whom it may concern, to view the repo from the point at which it was submitted, please follow this link: https://github.com/JYoussouf/Build-With-Gemma/tree/247ec44ba20fc2f5d82296f68e2ff32c4e936e25
Commits have been added since then to edit the readme, take down services intended for the demo, etc. Thank you!

**Contributors:** [@JYoussouf](https://github.com/JYoussouf), [@cbarronalive123](https://github.com/cbarronalive123) and [@HargunBhalla](https://github.com/HargunBhalla)

**Competition:** Google Deepmind & Google Developer's Group - Triage in Light Speed Hackathon - August 1st, 2026

**Development Time:** 7 hours


## Our Submission

**Kaggle Official Submission:** https://www.kaggle.com/competitions/build-with-gemma-triage-in-light-speed/writeups/racemind-pit-lane-telemetry

[RaceMind Demo Walkthrough](https://www.youtube.com/watch?v=IyKckEl1hwI
)

https://github.com/user-attachments/assets/75d9e6ba-7684-4f90-9d96-ef973c5d5c02

Hello! our team is Joe Youssouf, Hargun Bhalla and Corey Barron, we are team RaceMind!

Our industry experience is in predictive maintenance on transit vehicles and in manufacturing, so the telemetry track really attracted us. With startups like Preteckt (now a part of Snap-On), and Oden Technologies and more!

RaceMind is a real-time simulation tool built for two moments that matter most in racing: track training and race day performance. Built for any team looking to optimize their historical runs! From FormulaSAE rally groups to 24 hour Le Mans races!

Under the hood, we're running a mixture of specialized models - tread wear, fuel consumption forecasting, standardized rules models as well as fully unsupervised time-series anomaly detection powered by Google's TimesFM.

Our models are trained against our ever-growing database of OBD-II telematics data naturally transmitting from the CAN lines of our vehicles. This includes but is not limited to temperature, speed, pressure and other sensor data available on the vehicle. Upon setup, consumer teams can supply vehicle metadata, and we pull in weather data from reliable weather APIs like OpenWeather.

Each of these models are bootstrapped against simulated tread model data and improved via agent-in-the-loop reinforcement learning. That is, Gemma generates explicit tag-based rules to adjust model thresholds, or exclude entire classes of alerts, depending on the type of feedback provided by the engineering team. This naturally reduces noise in the system the more the engineering team uses it.

As a result, the Gemma family of models sits at the core of our system. Gemma translates every alert into clear, natural-language action for the driver, that provides and acts as an agent-in-the-loop filter. For historical learning, we can sacrifice real-time sensitivity, but in a live simulation, we use a lighter weight parameter model, tuned to our specific data, to enhance latency.

Predictive analytics is what drives us as a team, and RaceMind was our chance to push that passion as far as we could in one build!

Thank you for your consideration!
