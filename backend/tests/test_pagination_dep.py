from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

from app.dependencies import Pagination, get_pagination


def test_pagination_defaults():
    app = FastAPI()

    @app.get("/items")
    def items(p: Pagination = Depends(get_pagination)):
        return {"limit": p.limit, "offset": p.offset}

    client = TestClient(app)
    assert client.get("/items").json() == {"limit": 50, "offset": 0}
    assert client.get("/items?limit=10&offset=5").json() == {"limit": 10, "offset": 5}


def test_pagination_bounds():
    app = FastAPI()

    @app.get("/items")
    def items(p: Pagination = Depends(get_pagination)):
        return {"limit": p.limit, "offset": p.offset}

    client = TestClient(app)
    assert client.get("/items?limit=0").status_code == 422
    assert client.get("/items?limit=501").status_code == 422
    assert client.get("/items?offset=-1").status_code == 422
