# Taiwan CWA Weather GIS — Design Document

## 1. Project Overview

### Project Name
**Taiwan CWA Weather GIS**

### Project Goal
Build a web-based GIS application that:

1. Retrieves weather data from Taiwan Central Weather Administration (CWA) Open Data API.
2. Cleans and stores the weather data in a database.
3. Provides a backend API for querying stored weather data.
4. Displays weather information geographically on a Taiwan GIS map.
5. Uses GitHub for source control.
6. Automatically deploys the application to Vercel.

---

# 2. Core Workflow

```text
CWA Open Data API
        ↓
Fetch Weather Data
        ↓
Parse / Clean Data
        ↓
Save to Database
        ↓
Backend Query API
        ↓
Taiwan GIS Web
        ↓
GitHub
        ↓
Vercel Auto Deployment