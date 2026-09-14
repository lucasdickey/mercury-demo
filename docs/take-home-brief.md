# Mercury PM Take-Home: Command

Source: https://docs.google.com/document/d/1vpOHEyQZ6J-UUF5xz7t6YUFMCpVPrnWn18isj7jpIBI/edit

## Overview

We're constantly inspired by what's possible when great builders get their hands on the right tools. Our API team is tasked with building for our most ambitious customers. We'd love to use this opportunity to evaluate how you think and what you might build for them.

We're particularly interested in how Mercury's API could power experiences that don't require our UI. Experiences that could benefit from being headless, agentic, and/or conversational: think automating a recurring financial workflow, allowing agents to manage spend, or entirely new interfaces built on top of Mercury's core primitives. We're not prescribing what, the choice is part of what we're evaluating.

Start by getting familiar with Mercury: spend some time in the demo, dig into the API docs, and sign up for an account (you do not need to provide personal information) in our sandbox. Develop a point of view on what's interesting, what's possible today, and where the gaps are.

Then **build** something. Use your preferred tech stack; we expect you to leverage AI and will want to talk about what, why, and how.

The sandbox has limitations. If you hit one, tell us what you'd fix.

## What We Are Looking For

We are interested in how you think about building for Mercury's most ambitious customers. A strong demo will typically show:

- sound business judgment in Mercury's specific context
- understanding of our API and the interfaces (e.g. CLI, MCP) it enables
- thoughtful consideration of customer trust and product simplicity
- awareness of regulatory and operational tradeoffs

**Note:** We are using Mercury's actual business as the backdrop because the role requires this kind of judgment in practice. We are interested in your thinking and approach, treat this as a discussion artifact, not a deliverable we would act on. We retain ownership of Mercury's existing IP and while we may independently build similar things in the future, you retain ownership of anything you build.

## Format

Come ready to demo a working prototype and talk through your thinking: what you built, why you chose it, what you'd change about the API itself, and what you'd do next. You may choose the format that works best for you.

We recommend spending no more than two hours on this exercise. Some candidates will naturally invest more, but we want to be clear that is not expected. Quality of thinking matters more than polish or volume.

## Resources

Documentation

- Mercury demo: https://demo.mercury.com
- API docs: https://docs.mercury.com/docs/welcome
- Sandbox: https://sandbox.mercury.com/signup

### Starter Code (Python)

```python
#!/usr/bin/env python3
"""List Mercury accounts and print them to the console.

Set your token first:
    export MERCURY_API_TOKEN='secret-token:mercury_production_...'

Then run:
    python3 list_accounts.py
"""

import os
import sys
import urllib.request
import urllib.error
import json

API_URL = "https://api.mercury.com/api/v1/accounts"


def fetch_accounts(token):
    req = urllib.request.Request(
        API_URL,
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/json",
        },
    )
    with urllib.request.urlopen(req) as resp:
        return json.load(resp)


def main():
    token = os.environ.get("MERCURY_API_TOKEN")
    if not token:
        sys.exit("Error: set the MERCURY_API_TOKEN environment variable first.")
    try:
        data = fetch_accounts(token)
    except urllib.error.HTTPError as e:
        sys.exit(f"HTTP error {e.code}: {e.read().decode(errors='replace')}")
    except urllib.error.URLError as e:
        sys.exit(f"Network error: {e.reason}")

    accounts = data.get("accounts", [])
    if not accounts:
        print("No accounts found.")
        return

    print(f"Found {len(accounts)} account(s):\n")
    for acct in accounts:
        print(f"  {acct.get('name')} ({acct.get('nickname') or acct.get('kind')})")
        print(f"    id: {acct.get('id')}")
        print(f"    type: {acct.get('type')}")
        print(f"    status: {acct.get('status')}")
        print(f"    accountNumber: {acct.get('accountNumber')}")
        print(f"    routingNumber: {acct.get('routingNumber')}")
        print(f"    availableBalance: {acct.get('availableBalance')}")
        print(f"    currentBalance: {acct.get('currentBalance')}")
        print()


if __name__ == "__main__":
    main()
```
