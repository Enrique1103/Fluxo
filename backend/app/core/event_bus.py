import asyncio
from collections import defaultdict

# user_id (str) → lista de queues (una por conexión SSE abierta)
_subscriptions: dict[str, list[asyncio.Queue]] = defaultdict(list)


async def subscribe(user_id: str) -> asyncio.Queue:
    q: asyncio.Queue = asyncio.Queue()
    _subscriptions[user_id].append(q)
    return q


def unsubscribe(user_id: str, q: asyncio.Queue) -> None:
    try:
        _subscriptions[user_id].remove(q)
    except ValueError:
        pass


async def publish(user_id: str, event: dict) -> None:
    for q in list(_subscriptions.get(user_id, [])):
        await q.put(event)
