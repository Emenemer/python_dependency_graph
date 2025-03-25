from example_production.library.test_file import make_df
from file_to_trace import testclass


class TestClass:
    def some_function(self) -> str:
        return 'test'


if __name__ == '__main__':
    df = make_df()
