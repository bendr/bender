//
//  Element.h
//  Bender
//
//  Created by Julien Quint on 2/24/14.
//  Copyright (c) 2014 IGEL, Co., Ltd. All rights reserved.
//

#import <Foundation/Foundation.h>
#import "Node.h"
#import "Component.h"

@class View;

@interface Element : Node

@property (readonly) View *view;

@end


@interface View : Element

@property (weak, nonatomic) Component *component;
@property (nonatomic) BOOL isDefault;

@end


@interface Content : Element

@end


@interface DOMElement : Element

@property (strong, nonatomic) NSString *namespaceURI;
@property (strong, nonatomic) NSString *localName;
@property (strong, nonatomic) NSDictionary *attributes;

@end


@interface Attribute : Element

@property (strong, nonatomic) NSString *namespaceURI;
@property (strong, nonatomic) NSString *localName;

@end


@interface Text : Element

@property (strong, nonatomic) NSString *text;

@end
