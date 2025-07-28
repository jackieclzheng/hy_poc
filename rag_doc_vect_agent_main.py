from langchain_ollama.llms import  OllamaLLM
#from langchain_ollama import ChatOllama
from langchain_core.prompts import ChatPromptTemplate
from rag_doc_vect_retriever import retriever

#import os
import logging

logging.basicConfig(level=logging.DEBUG)

# current_dir = os.path.dirname(os.path.abspath(__file__))

# LLMModel = OllamaLLM(model="llama3") # "gemma:2b"  mistral  llama3
LLMModel = OllamaLLM(model="llama3.2:1b")
#ChatLLMModel = ChatOllama(model="llama3", temperature=0.7)

template_general = """
     Please refer to the review to answer {reviews}
    ,This is the question you asked : {question}
"""
template_vehicle = """
     I am a Hyundai Motor user. Please answer based on information about the vehicle,
     Please refer to the review to answer {reviews},
     This is the question you asked : {question}
"""
prompt = ChatPromptTemplate.from_template(template_vehicle)
chain = prompt | LLMModel   #chat_chain = prompt | LLMModel

while True:
    print("\n ------------------------")
    question = input("What is your question (q to quit): ")
    print("\n")
    if question == "q":
        break

    #---- with retriever vector embedding (rag_doc_vect_retriever.py)
    reviews = retriever.invoke(question)
    print(f"---retriever invoke reviews String : {reviews} ")
    result = chain.invoke({"reviews" : reviews, "question" : question})

    # ---- only template
    #result = chain.invoke({"reviews": [], "question": question})

    print(f"----result :\n {result}")

